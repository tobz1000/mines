nd = require('ndarray')
underscore = require('underscore')

const createNewGameGrid = (dims, mines) => {

    var size = dims.reduce((x, y) => x * y)
    if (size < mines) ; /* error? */
    var mines_rem = mines

    var gameArray = new Array(size).fill(false).fill(true, 0, mines)
    gameArray = underscore.shuffle(gameArray)

    var gameGrid = new nd(gameArray, dims)

    return gameGrid
}

// console.log(createNewGameGrid([10, 3], 8))