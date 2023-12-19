data = []
with open('test.txt', 'r') as file:
    for line in file:
        numbers = [float(num) for num in line.split()]
        data.append(numbers)