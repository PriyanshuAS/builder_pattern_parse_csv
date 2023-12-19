const fs = require("fs");
const path = require("path");

let parsedData = [];
let columnCount = 0;
let finalSpreadSheet = [];

function parseCSVFile(filename) {
  return new Promise((resolve, reject) => {
    const fileExtension = path.extname(filename).toLowerCase();
    console.log("File: " + filename);
    if (fileExtension !== ".csv") {
      reject(new Error("Provided file is not a .csv file"));
      return;
    }
    if (!fs.existsSync(filename)) {
      reject(new Error("The file does not exist"));
      return;
    }

    fs.readFile(filename, "utf-8", (err, data) => {
      if (err) {
        reject(err);
      } else {
        parsedData = data
          .match(/(?:[^\s",]|"(?:\\.|[^"])*")+/g)
          .map((item) => item.trim());
        columnCount = parsedData.length;
        resolve(parsedData);
      }
    });
  });
}

class SpreadsheetAssembler {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
  }

  compileSpreadsheet() {
    parsedData.forEach((cellValue) => {
      this.dataProcessor.processCell(cellValue);
    });
    console.log(finalSpreadSheet);
  }
}

class DataProcessor {
  #formulaMappings;

  constructor() {
    this.cells = {};
    this.#formulaMappings = new Map([
      ["SUM", (args) => args.reduce((a, b) => a + b, 0)],
      ["AVG", (args) => args.reduce((a, b) => a + b, 0) / args.length],
      ["STDEV", (args) => {
        const mean = args.reduce((acc, curr) => acc + curr) / parsedData.length;
        const variance = args.map((k) => (k - mean) ** 2).reduce((acc, curr) => acc + curr) / parsedData.length;
        return Math.sqrt(variance);
      }],
      ["MAX", (a, b) => Math.max(a, b)],
      ["MIN", (a, b) => Math.min(a, b)],
      ["COUNT", (args) => args.map(() => 1).reduce((a, b) => a + b, 0)],
      ["IF", (condition, trueValue, falseValue) => (condition ? trueValue : falseValue)],
      ["MOD", (a, b) => a % b, 0],
      ["POW", (a, b) => Math.pow(a, b), 0],
    ]);
  }

  processCell(cell) {
    if (cell.startsWith('"=') && cell.endsWith('"')) {
      cell = cell.substring(1, cell.length - 1);
    }

    if (cell.startsWith("=")) {
      let calc, range = [];
      if (cell.startsWith("=IF")) {
        calc = "IF";
      } else {
        calc = cell.split("=").pop().split("(")[0].toUpperCase();
      }

      if (cell.includes(":")) {
        range = cell.split("(").pop().split(")")[0].split(":");
        finalSpreadSheet.push(this.evaluateRangeFormula(calc, range));
      } else if (cell.includes(",")) {
        range = cell.split("(").pop().split(")")[0].split(",");
        finalSpreadSheet.push(this.evaluateConditionFormula(calc, range));
      } else if (cell.split("(").pop().split(")")[0].length === 2) {
        range = cell.split("(").pop().split(")")[0];
        const [col1, row1] = this.getColumnRow(range);
        const col1Check = col1.charCodeAt(0) - 65;
        const functionName = this.#formulaMappings.get(calc);
        const functionResult = functionName([parsedData[col1Check]]);
        finalSpreadSheet.push(functionResult);
      } else {
        console.log('Cell contains an invalid formula');
        finalSpreadSheet.push(0);
      }
    } else if (!isNaN(parseInt(cell))) {
      finalSpreadSheet.push(parseInt(cell));
    } else {
      throw new Error('Cell has invalid content');
    }
  }

  evaluateRangeFormula(calc, range) {
    const [col1, row1] = this.getColumnRow(range[0]);
    const [col2, row2] = this.getColumnRow(range[1]);
    const col1Check = col1.charCodeAt(0) - 65;
    const col2Check = col2.charCodeAt(0) - 65;

    // if (row1 != 1 || row2 != 1 || col1Check > columnCount || col2Check > columnCount) {
    //   throw new Error("Row or column references exceeded the range");
    // }

    if (col1Check > col2Check || row1 > row2) {
      throw new Error("Column numbers should go from low to high");
    }

    const functionName = this.#formulaMappings.get(calc);
    let args = parsedData.slice(col1Check, col2Check + 1).map(Number);
    const functionResult = functionName(args);
    return functionResult;
  }

  evaluateConditionFormula(calc, range) {
    const functionName = this.#formulaMappings.get(calc);

    if (calc == "IF") {
      let conditionCheck = range[0],
        trueValue = range[1],
        falseValue = range[2];

      const matches = conditionCheck.match(/([A-Z]\d+|[=<>]+|[A-Z]\d+)/g);
      if (matches) {
        let condition;
        const [cell1, operator, cell2] = matches;
        const [col1, row1] = this.getColumnRow(cell1);
        const [col2, row2] = this.getColumnRow(cell2);
        const col1Check = col1.charCodeAt(0) - 65;
        const col2Check = col2.charCodeAt(0) - 65;

        if (operator === "=") condition = col1Check === col2Check;
        else if (operator === "<") condition = col1Check < col2Check;
        else if (operator === ">") condition = col1Check > col2Check;
        else if (operator === ">=") condition = col1Check >= col2Check;
        else if (operator === "<=") condition = col1Check <= col2Check;
        else if (operator === "!=") condition = col1Check != col2Check;
        else throw new Error("IF condition wrongly specified");

        const functionResult = functionName(condition, trueValue, falseValue);
        return parseInt(functionResult);
      } else {
        console.log("Invalid formula format");
      }
    } else {
      let cellValue = range[0],
        opValue = range[1],
        col1Check,
        temp;

      if (!isNaN(opValue)) {
        const [col, row] = this.getColumnRow(cellValue);
        col1Check = col.charCodeAt(0) - 65;
        temp = opValue;
      } else {
        const [col1, row1] = this.getColumnRow(cellValue);
        col1Check = col1.charCodeAt(0) - 65;
        const [col2, row2] = this.getColumnRow(opValue);
        const col2Check = col2.charCodeAt(0) - 65;
        temp = parsedData[col2Check];
      }

      const functionResult = functionName(parsedData[col1Check], temp);
      return functionResult;
    }
  }

  getColumnRow(cell) {
    const set = cell.split(/(\d+)/);
    const col = set[0].toUpperCase();
    const row = parseInt(set[1]);
    return [col, row];
  }
}

parseCSVFile("testCSV.csv")
  .then(() => {
    const dataProcessor = new DataProcessor();
    const spreadsheetAssembler = new SpreadsheetAssembler(dataProcessor);
    spreadsheetAssembler.compileSpreadsheet();
  })
  .catch((err) => console.error(err));

module.exports = { parseCSVFile, DataProcessor, SpreadsheetAssembler};