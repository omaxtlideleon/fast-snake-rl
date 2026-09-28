const BOARD_SIZE = 32;
const CELL_SIZE = 20;

let lastTime = performance.now();
let gamesThisSecond = 0;
let highestReward = 0;
let highestScore = 0;
let highestSteps = 0;
let episodeScores = []; 

const ACTIONS = [
    { x: 0, y: -1 }, // up
    { x: 0, y: 1 },  // down
    { x: -1, y: 0 }, // left
    { x: 1, y: 0 }   // right
];
let gamesTrained = 0;
const grid = new Int8Array(BOARD_SIZE * BOARD_SIZE);
let snakeIndices = new Int32Array(BOARD_SIZE * BOARD_SIZE);
let snakeHeadPointer = 0;
let snakeTailPointer = 0;

let direction = { x: 0, y: -1 };
let food = { x: 0, y: 0 };
let walls = [];
let score = 0;
let gameInterval = null;

const gameBoard = document.getElementById("game-board");
const startButton = document.getElementById("start-button");
const wallsButton = document.getElementById("walls-button");
const trainButton = document.getElementById("train-button"); 
const playPolicyButton = document.getElementById("play-policy-button");
const rewardCanvas = document.getElementById("reward-chart");
const ctx = rewardCanvas.getContext("2d");
const aiBoard = document.getElementById("ai-board");

function drawBoard() {
    gameBoard.style.width = `${BOARD_SIZE * CELL_SIZE}px`;
    gameBoard.style.height = `${BOARD_SIZE * CELL_SIZE}px`;
    aiBoard.style.width = `${BOARD_SIZE * CELL_SIZE}px`;
    aiBoard.style.height = `${BOARD_SIZE * CELL_SIZE}px`;
}
function drawSnake() {
    gameBoard.innerHTML = "";

    for (let i = 0; i < grid.length; i++) {
        if (grid[i] === 1) {
            const x = i % BOARD_SIZE;
            const y = Math.floor(i / BOARD_SIZE);
            const snakeElement = document.createElement("div");
            snakeElement.className = "snake";
            snakeElement.style.left = `${x * CELL_SIZE}px`;
            snakeElement.style.top = `${y * CELL_SIZE}px`;
            gameBoard.appendChild(snakeElement);
        } else if (grid[i] === 2) {
            const x = i % BOARD_SIZE;
            const y = Math.floor(i / BOARD_SIZE);
            const foodElement = document.createElement("div");
            foodElement.className = "food";
            foodElement.style.left = `${x * CELL_SIZE}px`;
            foodElement.style.top = `${y * CELL_SIZE}px`;
            gameBoard.appendChild(foodElement);
        }
    }
}

function drawAIBoard(encodedState, state) {
    // I'm not yet sure how to adapt to other
    // states, or maybe I could render within encodeState (or similar)
    // itself, this is good for now though
    aiBoard.innerHTML = "";

    const [
        upDanger, downDanger, leftDanger, rightDanger,
        foodUp, foodDown, foodLeft, foodRight,
        headInTopHalf, headInLeftHalf
    ] = encodedState;

    const headX = state.headX;
    const headY = state.headY;

    const headElement = document.createElement("div");
    headElement.className = "snake-head-ai";
    headElement.style.position = "absolute";
    headElement.style.width = `${CELL_SIZE}px`;
    headElement.style.height = `${CELL_SIZE}px`;
    headElement.style.background = "#00ff00"; 
    headElement.style.left = `${headX * CELL_SIZE}px`;
    headElement.style.top = `${headY * CELL_SIZE}px`;
    aiBoard.appendChild(headElement);

    function drawIndicator(x, y, color) {
        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
        const elem = document.createElement("div");
        elem.style.position = "absolute";
        elem.style.width = `${CELL_SIZE}px`;
        elem.style.height = `${CELL_SIZE}px`;
        elem.style.background = color;
        elem.style.opacity = "0.7";
        elem.style.left = `${x * CELL_SIZE}px`;
        elem.style.top = `${y * CELL_SIZE}px`;
        aiBoard.appendChild(elem);
    }

    if (upDanger)    drawIndicator(headX, headY - 1, "#ff0000");
    if (downDanger)  drawIndicator(headX, headY + 1, "#ff0000");
    if (leftDanger)  drawIndicator(headX - 1, headY, "#ff0000");
    if (rightDanger) drawIndicator(headX + 1, headY, "#ff0000");

    let fx = headX;
    let fy = headY;
    if (foodLeft)  fx = Math.max(0, headX - 2);
    if (foodRight) fx = Math.min(BOARD_SIZE - 1, headX + 2);
    if (foodUp)    fy = Math.max(0, headY - 2);
    if (foodDown)  fy = Math.min(BOARD_SIZE - 1, headY + 2);

    if (foodLeft || foodRight || foodUp || foodDown) {
        drawIndicator(fx, fy, "#ffff00");
    }

    const quad = document.createElement("div");
    quad.style.position = "absolute";
    quad.style.border = "1px dashed rgba(0, 255, 255, 0.2)";
    quad.style.width = `${(BOARD_SIZE/2) * CELL_SIZE}px`;
    quad.style.height = `${(BOARD_SIZE/2) * CELL_SIZE}px`;
    quad.style.left = headInLeftHalf ? "0px" : `${(BOARD_SIZE/2) * CELL_SIZE}px`;
    quad.style.top = headInTopHalf ? "0px" : `${(BOARD_SIZE/2) * CELL_SIZE}px`;
    quad.style.background = "rgba(0, 255, 255, 0.05)";
    aiBoard.appendChild(quad);
}

function generateFood() {
    let idx;
    do {
        idx = Math.floor(Math.random() * (BOARD_SIZE * BOARD_SIZE));
    } while (grid[idx] !== 0);
    
    grid[idx] = 2; 
    food.x = idx % BOARD_SIZE;
    food.y = Math.floor(idx / BOARD_SIZE);
}

function isDanger(x, y) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return true;
    return grid[y * BOARD_SIZE + x] === 1;
}

function moveSnakeOneStep(action) {
    if (!isOppositeDirection(action, direction)) {
        direction = action;
    }
    
    const currentHeadIdx = snakeIndices[snakeHeadPointer];
    let headX = (currentHeadIdx % BOARD_SIZE) + direction.x;
    let headY = Math.floor(currentHeadIdx / BOARD_SIZE) + direction.y;

    if (headX < 0 || headX >= BOARD_SIZE || headY < 0 || headY >= BOARD_SIZE) {
        return { ateFood: false, dead: true };
    }

    const nextIdx = headY * BOARD_SIZE + headX;
    if (grid[nextIdx] === 1) {
        return { ateFood: false, dead: true };
    }

    const ateFood = (grid[nextIdx] === 2);

    snakeHeadPointer = (snakeHeadPointer - 1 + snakeIndices.length) % snakeIndices.length;
    snakeIndices[snakeHeadPointer] = nextIdx;
    grid[nextIdx] = 1;

    if (ateFood) {
        score++;
        generateFood();
    } else {
        const tailIdx = snakeIndices[snakeTailPointer];
        grid[tailIdx] = 0;
        snakeTailPointer = (snakeTailPointer - 1 + snakeIndices.length) % snakeIndices.length;
    }

    return { ateFood, dead: false };
}

const snakeEnv = {
    reset() {
        grid.fill(0);
        score = 0;
        direction = { x: 0, y: -1 };
        walls = [];

        const startIdx = 10 * BOARD_SIZE + 10;
        snakeIndices[0] = startIdx;
        grid[startIdx] = 1;
        snakeHeadPointer = 0;
        snakeTailPointer = 0;

        generateFood();
        return this.getState();
    },

    getState() {
        const currentHeadIdx = snakeIndices[snakeHeadPointer];
        return {
            headX: currentHeadIdx % BOARD_SIZE,
            headY: Math.floor(currentHeadIdx / BOARD_SIZE),
            foodX: food.x,
            foodY: food.y
        };
    },

    step(actionIndex) {
        const action = ACTIONS[actionIndex];
        const oldScore = score;

        const { ateFood, dead } = moveSnakeOneStep(action);
        const newState = this.getState();

        let reward = -0.0001;
        if (ateFood && score > oldScore) reward = 1;

        if (dead) {
            reward = Math.max(-8.0, -8.0 + (score * 0.04)); 
        }

        return { nextState: newState, reward, done: dead };
    }
};

function generateWall() {
    let newWall;
    do {
        newWall = {
            x: Math.floor(Math.random() * BOARD_SIZE),
            y: Math.floor(Math.random() * BOARD_SIZE)
        };
    } while (
        snake.some(segment => segment.x === newWall.x && segment.y === newWall.y) ||
        (food.x === newWall.x && food.y === newWall.y) ||
        walls.some(wall => wall.x === newWall.x && wall.y === newWall.y)
    );
    walls.push(newWall);
}

function isDead() {
    const head = snake[0];
    return (
        head.x < 0 || head.x >= BOARD_SIZE ||
        head.y < 0 || head.y >= BOARD_SIZE ||
        snake.slice(1).some(s => s.x === head.x && s.y === head.y) ||
        walls.some(w => w.x === head.x && w.y === head.y)
    );
}

function encodeState(state) {
    const headX = state.headX;
    const headY = state.headY;
  
    /*
      note:
      `-x,-y` = left, up
      `-x,+y` = left, down
      `+x,+y` = right, down
      `+x,-y` = right, up
    */
  
    const upDanger    = isDanger(headX, headY - 1) ? 1 : 0;
    const downDanger  = isDanger(headX, headY + 1) ? 1 : 0;
    const leftDanger  = isDanger(headX - 1, headY) ? 1 : 0;
    const rightDanger = isDanger(headX + 1, headY) ? 1 : 0;

    const tailIdx = snakeIndices[snakeTailPointer];
    
    const tailX = tailIdx % BOARD_SIZE;
    const tailY = Math.floor(tailIdx / BOARD_SIZE);
    
    const tailUp    = tailY < headY ? 1 : 0;
    const tailDown  = tailY > headY ? 1 : 0; 
    const tailLeft  = tailX < headX ? 1 : 0; 
    const tailRight = tailX > headX ? 1 : 0; 

    const movingUp    = (direction.x === 0 && direction.y === -1) ? 1 : 0;
    const movingDown  = (direction.x === 0 && direction.y === 1)  ? 1 : 0;
    const movingLeft  = (direction.x === -1 && direction.y === 0) ? 1 : 0;
    const movingRight = (direction.x === 1 && direction.y === 0)  ? 1 : 0;

    const foodUp    = food.y < headY ? 1 : 0;
    const foodDown  = food.y > headY ? 1 : 0;
    const foodLeft  = food.x < headX ? 1 : 0;
    const foodRight = food.x > headX ? 1 : 0;
    
    const headInTopHalf  = headY < (BOARD_SIZE/2) ? 1 : 0;
    const headInLeftHalf = headX < (BOARD_SIZE/2) ? 1 : 0;
  
    return [
        upDanger, downDanger, leftDanger, rightDanger,
        // tailUp, tailDown, tailLeft, tailRight,
        // movingUp, movingDown, movingLeft, movingRight,
        foodUp, foodDown, foodLeft, foodRight,
        // headInTopHalf, headInLeftHalf
    ];
}

function stateKeyFromEncoded(encoded) {
    return encoded.join(",");
}

class QAgent {
    constructor(numActions, alpha = 0.08, gamma = 0.99, epsilon = 1.0, epsilonMin = 0.01, epsilonDecay = 0.99999) {
        this.numActions = numActions;
        this.alpha = alpha;
        this.gamma = gamma;
        this.epsilon = epsilon;
        this.epsilonMin = epsilonMin;
        this.epsilonDecay = epsilonDecay;
        this.Q = {}; // { stateKey: [q0, q1, q2, q3] }
    }

    getQ(stateKey) {
        if (!this.Q[stateKey]) {
            this.Q[stateKey] = new Array(this.numActions).fill(0);
        }
        return this.Q[stateKey];
    }

    chooseAction(stateKey) {
        if (Math.random() < this.epsilon) {
            return Math.floor(Math.random() * this.numActions);
        }
        const qValues = this.getQ(stateKey);
        let bestIdx = 0;
        let bestVal = qValues[0];
        for (let i = 1; i < qValues.length; i++) {
            if (qValues[i] > bestVal) {
                bestVal = qValues[i];
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    learn(stateKey, action, reward, nextStateKey, done) {
          const qValues = this.getQ(stateKey);
        const nextQ = this.getQ(nextStateKey);
        const target = reward + (done ? 0 : this.gamma * Math.max(...nextQ));
        qValues[action] += this.alpha * (target - qValues[action]);

        if (done && this.epsilon > this.epsilonMin) {
            this.epsilon *= this.epsilonDecay;
        }
    }
}

const agent = new QAgent(ACTIONS.length);
let episodeRewards = [];

function movingAverage(data, window = 50) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = data.slice(start, i + 1);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
        result.push(avg);
    }
    return result;
}

function updateGraph(rewards) {
    if (rewards.length === 0) return;

    ctx.clearRect(0, 0, rewardCanvas.width, rewardCanvas.height);

    const avg50 = movingAverage(rewards, 50);
    const avg200 = movingAverage(rewards, 200);

    let maxVal = -Infinity;
    let minVal = Infinity;
    const n = rewards.length;
    for (let i = 0; i < rewards.length; i++) {
        if (rewards[i] > maxVal) maxVal = rewards[i];
        if (rewards[i] < minVal) minVal = rewards[i];
        
        if (avg50[i] > maxVal) maxVal = avg50[i];
        if (avg50[i] < minVal) minVal = avg50[i];
        
        if (avg200[i] > maxVal) maxVal = avg200[i];
        if (avg200[i] < minVal) minVal = avg200[i];
    }
    // raw
    ctx.beginPath();
    ctx.strokeStyle = "lime";
    ctx.lineWidth = 1;
    rewards.forEach((r, i) => {
        const x = (i / Math.max(1, n - 1)) * rewardCanvas.width;
        const yNorm = (r - minVal) / Math.max(1e-6, maxVal - minVal);
        const y = rewardCanvas.height - yNorm * rewardCanvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 50‑game avg
    ctx.beginPath();
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 2;
    avg50.forEach((r, i) => {
        const x = (i / Math.max(1, n - 1)) * rewardCanvas.width;
        const yNorm = (r - minVal) / Math.max(1e-6, maxVal - minVal);
        const y = rewardCanvas.height - yNorm * rewardCanvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 200‑game avg
    ctx.beginPath();
    ctx.strokeStyle = "purple";
    ctx.lineWidth = 2;
    avg200.forEach((r, i) => {
        const x = (i / Math.max(1, n - 1)) * rewardCanvas.width;
        const yNorm = (r - minVal) / Math.max(1e-6, maxVal - minVal);
        const y = rewardCanvas.height - yNorm * rewardCanvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}
function updateStats(totalReward, episode, currentScore, currentSteps) {
    if (totalReward > highestReward) highestReward = totalReward;
    if (currentScore > highestScore) highestScore = currentScore;
    if (currentSteps > highestSteps) highestSteps = currentSteps;
    const now = performance.now();
    if (now - lastTime >= 1000) {
        document.getElementById("games-sec").textContent = gamesThisSecond;
        gamesThisSecond = 0;
        lastTime = now;
    }
    gamesThisSecond += 5000;

    document.getElementById("games-trained").textContent = gamesTrained;
    document.getElementById("games-count").textContent = episode;
    document.getElementById("highest-reward").textContent = highestReward;
    document.getElementById("highest-steps").textContent = highestSteps;

    const avg = episodeRewards.reduce((a, b) => a + b, 0) / episodeRewards.length;
    document.getElementById("avg-reward").textContent = avg.toFixed(3);

    document.getElementById("epsilon-val").textContent = agent.epsilon.toFixed(9);
    const highestScoreElem = document.getElementById("highest-score");
    const highestStepsElem = document.getElementById("highest-steps");
    if (highestScoreElem) highestScoreElem.textContent = highestScore;
    if (highestStepsElem) highestStepsElem.textContent = highestSteps
    const avgScoreElem = document.getElementById("avg-score");
    if (avgScoreElem && episodeScores.length > 0) {
      const avgScr = episodeScores.reduce((a, b) => a + b, 0) / episodeScores.length;
      avgScoreElem.textContent = avgScr.toFixed(2);
    }
}

async function train(numEpisodes = 500) {
    episodeRewards = [];
    for (let ep = 0; ep <= numEpisodes; ep++) {
        let state = snakeEnv.reset();
        let encoded = encodeState(state);
        let stateKey = stateKeyFromEncoded(encoded);
        
        let totalReward = 0;
        let steps = 0;

        while (true) {
            const action = agent.chooseAction(stateKey);
            const { nextState, reward, done } = snakeEnv.step(action);
            const nextEncoded = encodeState(nextState);
            const nextStateKey = stateKeyFromEncoded(nextEncoded);

            agent.learn(stateKey, action, reward, nextStateKey, done);

            stateKey = nextStateKey;
            totalReward += reward;
            steps++;

            if (done || steps > 500000) break;
        }
      
        gamesTrained++
        episodeRewards.push(totalReward);
        episodeScores.push(score);
      
        if (ep % 5000 === 0) {
            updateGraph(episodeRewards);
            updateStats(totalReward, ep, score, steps);
        }
      
        if (ep % 2500 === 0) await new Promise(r => setTimeout(r, 0));
    }
}

let delay = 50;
function playWithPolicy() {
    clearInterval(gameInterval);
    let state = snakeEnv.reset();
    let encoded = encodeState(state);
    let stateKey = stateKeyFromEncoded(encoded);
    let numSteps = 0;

    gameInterval = setInterval(() => {
        const action = agent.chooseAction(stateKey);
        const { nextState, reward, done } = snakeEnv.step(action);
        
        encoded = encodeState(nextState);
        stateKey = stateKeyFromEncoded(encoded);
        
        drawSnake(); 
        drawAIBoard(encoded, nextState);
        
        numSteps++;
        if (done) {
            clearInterval(gameInterval);
            alert(`Episode finished. Score: ${score}. Steps: ${numSteps}.`);
        }
    }, delay);
}

let manualDirection = { x: 0, y: -1 };
function isOppositeDirection(newDir, currentDir) {
    return newDir.x === -currentDir.x && newDir.y === -currentDir.y;
}
function changeDirection(event) {
    let newDir = direction;

    switch (event.key) {
        case "ArrowUp":
            newDir = { x: 0, y: -1 };
            break;
        case "ArrowDown":
            newDir = { x: 0, y: 1 };
            break;
        case "ArrowLeft":
            newDir = { x: -1, y: 0 };
            break;
        case "ArrowRight":
            newDir = { x: 1, y: 0 };
            break;
    }

    if (!isOppositeDirection(newDir, direction)) {
        direction = newDir;
    }
}

function startManualPlay() {
    clearInterval(gameInterval);
    snakeEnv.reset();
    gameInterval = setInterval(() => {
        const { ateFood, dead } = moveSnakeOneStep(manualDirection);
        drawSnake();
        if (dead) {
            clearInterval(gameInterval);
            alert(`Game Over! Score: ${score}`);
        }
    }, 10);
}

startButton.addEventListener("click", () => {
    startManualPlay();
});

wallsButton.addEventListener("click", () => {
    walls = [];
});

trainButton.addEventListener("click", () => {
    train(5000);
});

playPolicyButton.addEventListener("click", () => {
    playWithPolicy();
});

document.addEventListener("keydown", changeDirection);

drawBoard();
snakeEnv.reset();
// Object.keys(agent.Q).length 
