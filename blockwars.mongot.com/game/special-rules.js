// Effect of each special on an arena matrix. Shared by the browser (script tag) and the server bot (require).
(function (root) {
    function shuffle(arr, random) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            const temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
        }
        return arr;
    }

    /**
     * Mutates matrix (an array of rows, 0 = empty, 1-7 = block colours, 8+ = specials) in place.
     * options.switchMatrix is the opponent's matrix for special 16; options.random is for tests.
     * Returns false for an unknown special.
     */
    function applySpecial(matrix, special, options) {
        const switchMatrix = options && options.switchMatrix;
        const random = (options && options.random) || Math.random;
        const height = matrix.length;
        const width = matrix[0].length;

        switch (special) {
            case 8: { // Add row
                const row = new Array(width);
                for (let i = 0; i < row.length; i += 1) { // random colour for each square
                    row[i] = Math.floor((random() * 7) + 1);
                }
                row[Math.floor(random() * row.length)] = 0; // remove colour on random square
                matrix.splice(0, 1); // remove first row
                matrix.push(row); // add created row last
                break;
            }
            case 9: { // Remove row
                const removeRow = matrix.splice(height - 1, 1)[0].fill(0);
                matrix.unshift(removeRow);
                break;
            }
            case 10: // Earthquake, shuffle each row
                for (let y = matrix.length - 1; y > 0; y -= 1) {
                    shuffle(matrix[y], random);
                }
                break;
            case 11: { // Milkshake, shuffle rows vertical
                let counter = 0;
                // Remove empty rows
                outer: for (let y = 0; y < height; y += 1) {
                    for (let x = 0; x < width; x += 1) {
                        if (matrix[0][x] > 0) {
                            if (y > 7) { // Extra row to increase height if more than 5 visible empty rows left in arena
                                counter -= 2;
                                matrix.unshift(new Array(width).fill(0));
                                matrix.unshift(new Array(width).fill(0));
                            }
                            break outer;
                        }
                    }
                    counter++;
                    matrix.splice(0, 1);
                }

                const matrixLength = matrix.length;

                for (let x = 0; x < width; x++) {
                    const temp = [];
                    for (let i = 0; i < matrixLength; i++) {
                        temp.push(matrix[i].shift());
                    }

                    shuffle(matrix, random);

                    for (let i = 0; i < matrixLength; i++) {
                        matrix[i].push(temp.shift());
                    }
                }

                // check if any row are filled, then remove a block
                for (let y = 0; y < matrix.length; y++) {
                    if (matrix[y].indexOf(0) === -1) {
                        for (let x = 0; x < width; x++) {
                            // if not a special then remove block
                            if (matrix[y][x] < 8) {
                                matrix[y][x] = 0;
                                break;
                            }
                        }
                    }
                }

                // Add the removed blocks
                while (counter--) {
                    matrix.unshift(new Array(width).fill(0));
                }
                break;
            }
            case 12: // Remove all specials
                for (let y = matrix.length - 1; y > 0; y -= 1) {
                    for (let x = 0; x < matrix[y].length; x += 1) {
                        if (matrix[y][x] > 7) {
                            matrix[y][x] = Math.floor((random() * 7) + 1);
                        }
                    }
                }
                break;
            case 13: // Shotgun
                for (let y = matrix.length - 1; y > 0; y -= 1) {
                    const length = matrix[y].length;
                    matrix[y][Math.floor(random() * length)] = 0;
                    matrix[y][Math.floor(random() * length)] = 0;
                }
                break;
            case 14: // Gravitation
                for (let y = matrix.length - 1; y > 0; y -= 1) {
                    for (let x = 0; x < matrix[y].length; x += 1) {
                        if (matrix[y][x] !== 0) { // if block is not null then push every block bellow it
                            for (let i = y; i < matrix.length; i += 1) {
                                if (matrix[i][x] === 0) {
                                    matrix[i][x] = matrix[i - 1][x]; // change colour to above block
                                    matrix[i - 1][x] = 0; // change the above block to no colour
                                }
                            }
                        }
                    }
                }
                for (let i = 0; i < matrix.length; i++) { // remove full rows
                    if (matrix[i].indexOf(0) === -1) {
                        const row = matrix.splice(i, 1)[0].fill(0); // sweep row
                        matrix.unshift(row); // move it to the top
                    }
                }
                break;
            case 15: // Clear arena
                for (let y = 0; y < matrix.length; y += 1) {
                    matrix[y].fill(0);
                }
                break;
            case 16: // Switch arena
                for (let y = matrix.length - 1; y >= 0; y -= 1) {
                    for (let x = 0; x < matrix[y].length; x += 1) {
                        matrix[y][x] = switchMatrix[y][x];
                    }
                }
                break;
            case 17: // Monster
                for (let y = 8; y < matrix.length; y += 1) {
                    matrix[y].fill(2);
                }
                for (let y = 0; y < 8; y += 1) {
                    matrix[y].fill(0);
                }
                // [row, columns to open] shapes the monster out of the filled rows
                [
                    [8, [4, 5]],
                    [9, [2, 4, 5, 7]],
                    [10, [0, 1, 2, 7, 8, 9]],
                    [11, [0, 1, 8, 9]],
                    [12, [0, 9]],
                    [13, [2, 3, 6, 7]],
                    [14, [2, 3, 6, 7]],
                    [15, [2, 7]],
                    [16, [2, 7]],
                    [17, [0, 9]],
                    [18, [0, 1, 8, 9]],
                    [19, [0, 1, 2, 7, 8, 9]],
                    [20, [0, 1, 2, 4, 5, 7, 8, 9]],
                    [21, [4, 5]]
                ].forEach(([y, columns]) => columns.forEach(x => { matrix[y][x] = 0; }));
                matrix[15][3] = 1; matrix[15][6] = 1; // eyes
                matrix[16][3] = 1; matrix[16][6] = 1;
                break;
            case 18: // Mine, switch specials to mines
                for (let y = matrix.length - 1; y > 0; y -= 1) {
                    for (let x = 0; x < matrix[y].length; x += 1) {
                        if (matrix[y][x] > 7) {
                            matrix[y][x] = 19;
                        }
                    }
                }
                break;
            default:
                return false;
        }
        return true;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = applySpecial;
    } else {
        root.applySpecial = applySpecial;
    }
})(typeof self !== 'undefined' ? self : this);
