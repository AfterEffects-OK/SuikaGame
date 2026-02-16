const WORLD_WIDTH = 600;
const WORLD_HEIGHT = 900;
const DEADLINE_Y = 150;
const DROP_COOLDOWN = 600;

const { Engine, Render, Runner, Bodies, Composite, Events, Body } = Matter;

let engine, render, runner;
let currentFruit = null;
let nextFruitIndex = Math.floor(Math.random() * 5);
let score = 0;
let isGameOver = false;
let canDrop = true;
let isBgmPlaying = false;
let isGameInitialized = false;
let audioCtx;
let mouseX = WORLD_WIDTH / 2;
let isBgmEnabled = true;
let isSeEnabled = true;

function init() {
    if (isGameInitialized) return;    
    setupGamePhysics();
    setupContainerEvents();
    prepareNextFruit();
    createVisualEvolutionPath();
    isGameInitialized = true;
}

function startGame(enableGyro = false) {
    // 設定の読み込み
    const savedBgm = localStorage.getItem('vibe_suika_bgm');
    const savedSe = localStorage.getItem('vibe_suika_se');

    if (savedBgm !== null) isBgmEnabled = (savedBgm === 'true');
    if (savedSe !== null) isSeEnabled = (savedSe === 'true');

    // window.onloadで呼び出されるため、DOMの準備は完了している
    if (!isGameInitialized) {
        init();
    } else {
        resetGame();
    }
    playBgm();

    // ジャイロセンサー（重力操作）の許可リクエスト
    if (enableGyro) {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        window.addEventListener('deviceorientation', handleOrientation);
                    }
                })
                .catch(e => console.log(e));
        } else {
            window.addEventListener('deviceorientation', handleOrientation);
        }
    }
}

function giveUpGame() {
    if (isGameOver) return;
    
    // ハイスコア保存
    const currentHigh = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0');
    if (score > currentHigh) {
        localStorage.setItem(HIGH_SCORE_KEY, score);
    }
    
    window.location.href = 'index.html';
}

function setupGamePhysics() {
    if (runner) {
        Runner.stop(runner);
        runner = null;
    }
    if (render) {
        Render.stop(render);
        if (render.canvas) {
            render.canvas.remove();
        }
        render.canvas = null;
        render.context = null;
        render.textures = {};
        render = null;
    }
    if (engine) {
        World.clear(engine.world);
        Engine.clear(engine);
        engine = null;
    }

    const container = document.getElementById('game-container');
    // 既存のCanvasがあれば再利用する
    const existingCanvas = container.querySelector('canvas');

    engine = Engine.create({ gravity: { y: 1.5 } });
    render = Render.create({
        element: container,
        canvas: existingCanvas || undefined, // 既存があれば使う、なければ新規作成
        engine: engine,
        options: { width: WORLD_WIDTH, height: WORLD_HEIGHT, wireframes: false, background: '#fff' }
    });

    const wallOptions = { isStatic: true, render: { visible: false } };
    const floor = Bodies.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT + 25, WORLD_WIDTH, 50, wallOptions);
    const leftWall = Bodies.rectangle(-25, WORLD_HEIGHT / 2, 50, WORLD_HEIGHT, wallOptions);
    const rightWall = Bodies.rectangle(WORLD_WIDTH + 25, WORLD_HEIGHT / 2, 50, WORLD_HEIGHT, wallOptions);
    
    Composite.add(engine.world, [floor, leftWall, rightWall]);
    
    setupPhysicsEvents();

    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);
}

function resetGame() {
    // リスタート時の表示不具合を回避するため、ページをリロードしてタイトルに戻る
    location.reload();
}

function prepareNextFruit() {
    if (isGameOver) return;
    const index = nextFruitIndex;
    nextFruitIndex = Math.floor(Math.random() * 5);
    document.getElementById('next-fruit').innerText = FRUIT_TYPES[nextFruitIndex].emoji;
    currentFruit = index;
    canDrop = true;
}

function spawnFruit(x, y, index) {
    const config = FRUIT_TYPES[index];
    const fruit = Bodies.circle(x, y, config.radius, {
        restitution: 0.3, friction: 0.1, label: `fruit_${index}`,
        render: { fillStyle: config.color, strokeStyle: '#fff', lineWidth: 3 }
    });
    fruit.fruitIndex = index;
    return fruit;
}

function playBgm() {
    if (!isBgmEnabled || isBgmPlaying) return;
    const bgm = document.getElementById('bgm');
    bgm.volume = 0.1; // 音量をさらに下げる
    bgm.play().then(() => {
        isBgmPlaying = true;
    }).catch(e => console.log("Audio play failed", e));
}

function playPopSound() {
    if (!isSeEnabled) return;
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
}

function handleOrientation(event) {
    if (!engine) return;
    const x = event.gamma; // -90 to 90 (左右の傾き)
    if (x === null) return;

    // 傾きを制限（最大45度まで）して重力に反映
    const angle = Math.min(Math.max(x, -45), 45);
    const rad = angle * (Math.PI / 180);
    engine.world.gravity.x = Math.sin(rad) * 1.5;
    engine.world.gravity.y = Math.cos(rad) * 1.5;
}

function setupContainerEvents() {
    const container = document.getElementById('game-container');
    const gameOver = document.getElementById('game-over');
    const updatePosition = (e) => {
        if (isGameOver || !canDrop) return;
        if (e.type.startsWith('touch')) e.preventDefault();
        const rect = container.getBoundingClientRect();
        const scale = WORLD_WIDTH / rect.width;
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
        mouseX = (clientX - rect.left) * scale;
        const radius = FRUIT_TYPES[currentFruit].radius;
        if (mouseX < radius) mouseX = radius;
        if (mouseX > WORLD_WIDTH - radius) mouseX = WORLD_WIDTH - radius;
    };

    // ゲームオーバー画面でのタッチ操作がゲーム側に伝播しないようにする（ボタン反応用）
    const stopPropagation = (e) => e.stopPropagation();
    gameOver.addEventListener('touchstart', stopPropagation);
    gameOver.addEventListener('touchend', stopPropagation);
    gameOver.addEventListener('mousedown', stopPropagation);

    container.addEventListener('mousemove', updatePosition);
    container.addEventListener('touchstart', (e) => { playBgm(); updatePosition(e); }, {passive: false});
    container.addEventListener('touchmove', updatePosition, {passive: false});

    const handleDrop = () => {
        if (isGameOver || !canDrop) return;
        canDrop = false;
        const fruit = spawnFruit(mouseX, 120, currentFruit);
        Composite.add(engine.world, fruit);
        setTimeout(() => prepareNextFruit(), DROP_COOLDOWN);
    };

    container.addEventListener('mousedown', (e) => { playBgm(); handleDrop(); });
    container.addEventListener('touchend', (e) => { e.preventDefault(); handleDrop(); });
}

function setupPhysicsEvents() {
    Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach((pair) => {
            const bodyA = pair.bodyA; const bodyB = pair.bodyB;
            if (bodyA.label.startsWith('fruit_') && bodyA.label === bodyB.label) {
                const index = bodyA.fruitIndex;
                if (index < FRUIT_TYPES.length - 1) {
                    const nextIndex = index + 1;
                    const midX = (bodyA.position.x + bodyB.position.x) / 2;
                    const midY = (bodyA.position.y + bodyB.position.y) / 2;
                    Composite.remove(engine.world, [bodyA, bodyB]);
                    const newFruit = spawnFruit(midX, midY, nextIndex);
                    Composite.add(engine.world, newFruit);
                    updateScore(FRUIT_TYPES[nextIndex].score);
                    playPopSound();
                }
            }
        });
    });

    Events.on(render, 'afterRender', () => {
        const ctx = render.context;
        
        // 容器の描画（角丸の枠線）
        ctx.save();
        ctx.lineWidth = 20;
        ctx.strokeStyle = '#ffccd5'; // 容器の色（薄いピンク）
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -50); // 左上（画面外）
        ctx.lineTo(0, WORLD_HEIGHT - 20);
        ctx.quadraticCurveTo(0, WORLD_HEIGHT, 20, WORLD_HEIGHT); // 左下の角丸
        ctx.lineTo(WORLD_WIDTH - 20, WORLD_HEIGHT);
        ctx.quadraticCurveTo(WORLD_WIDTH, WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT - 20); // 右下の角丸
        ctx.lineTo(WORLD_WIDTH, -50); // 右上（画面外）
        ctx.stroke();
        ctx.restore();

        ctx.beginPath(); ctx.setLineDash([5, 5]);
        ctx.moveTo(0, DEADLINE_Y); ctx.lineTo(WORLD_WIDTH, DEADLINE_Y);
        ctx.strokeStyle = '#ff8fa3'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);

        if (canDrop && currentFruit !== null) {
            ctx.beginPath(); ctx.moveTo(mouseX, 120); ctx.lineTo(mouseX, WORLD_HEIGHT);
            ctx.strokeStyle = 'rgba(255, 143, 163, 0.1)'; ctx.stroke();
            const config = FRUIT_TYPES[currentFruit];
            ctx.beginPath(); ctx.arc(mouseX, 120, config.radius, 0, Math.PI * 2);
            ctx.fillStyle = config.color; ctx.fill();
            ctx.font = `${config.radius * 1.3}px serif`; 
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(config.emoji, mouseX, 125);
        }

        Composite.allBodies(engine.world).forEach(body => {
            if (body.fruitIndex !== undefined) {
                const config = FRUIT_TYPES[body.fruitIndex];
                ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
                ctx.font = `${config.radius * 1.5}px serif`; 
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(config.emoji, 0, 2); ctx.restore();
            }
        });
        checkGameOver();
    });
}

function updateScore(points) {
    score += points;
    document.getElementById('score').innerText = score;
}

function checkGameOver() {
    if (isGameOver) return;
    const allBodies = Composite.allBodies(engine.world);
    let overTriggered = false;
    allBodies.forEach(body => {
        if (!body.isStatic && body.position.y < DEADLINE_Y && body.velocity.y < 0.2 && body.position.y > 0) {
            if (!body.overStartTime) body.overStartTime = Date.now();
            if (Date.now() - body.overStartTime > 2000) overTriggered = true;
        } else {
            body.overStartTime = null;
        }
    });
    if (overTriggered) {
        isGameOver = true;
        Runner.stop(runner);

        // 「おしまい！」メッセージを表示
        const messageEl = document.getElementById('game-over-message');
        messageEl.classList.remove('hidden');
        
        // ハイスコア保存
        const currentHigh = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0');
        if (score > currentHigh) {
            localStorage.setItem(HIGH_SCORE_KEY, score);
        }

        // 最大のフルーツインデックスを取得
        let maxFruitIndex = 0;
        allBodies.forEach(body => {
            if (body.label && body.label.startsWith('fruit_')) {
                if (body.fruitIndex > maxFruitIndex) {
                    maxFruitIndex = body.fruitIndex;
                }
            }
        });

        // 2秒後に結果ページへ遷移
        setTimeout(() => {
            window.location.href = `result.html?score=${score}&maxFruit=${maxFruitIndex}`;
        }, 2000);
    }
}

// ページ読み込み時に自動開始
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    startGame(urlParams.get('gyro') === 'true');
};

function createVisualEvolutionPath() {
    const container = document.getElementById('evolution-visualizer');
    if (!container) return;
    
    // 既に生成済みかチェック（.evo-item-node があるかどうか）
    if (container.querySelector('.evo-item-node')) return;

    const svg = document.getElementById('evolution-arrows-svg');
    const total = FRUIT_TYPES.length;
    // コンテナのサイズを取得
    const size = container.offsetWidth || 380; 
    const centerX = size / 2;
    const centerY = size / 2;
    const scaleFactor = size / 380; 
    const orbitRadius = size * 0.38;
    const coords = [];

    FRUIT_TYPES.forEach((fruit, index) => {
        const angle = (index / total) * (Math.PI * 2) - Math.PI / 2;
        const x = centerX + orbitRadius * Math.cos(angle);
        const y = centerY + orbitRadius * Math.sin(angle);
        coords.push({x, y});

        const node = document.createElement('div');
        node.className = 'evo-item-node';
        const nodeSize = (30 + index * 5) * scaleFactor;
        node.style.width = `${nodeSize}px`;
        node.style.height = `${nodeSize}px`;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.style.transform = `translate(-50%, -50%)`;
        node.style.borderColor = fruit.color;
        node.style.fontSize = `${nodeSize * 0.7}px`;
        node.innerHTML = fruit.emoji;
        container.appendChild(node);
    });

    if (svg) {
        for (let i = 0; i < total; i++) {
            const start = coords[i];
            const end = coords[(i + 1) % total];
            if (i === total - 1) continue;
            
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const nodeSizeStart = ((30 + i * 5) * scaleFactor) / 2;
            const nodeSizeEnd = ((30 + ((i + 1) % total) * 5) * scaleFactor) / 2;
            const padding = 5;
            
            const x1 = start.x + (dx / dist) * (nodeSizeStart + padding);
            const y1 = start.y + (dy / dist) * (nodeSizeStart + padding);
            const x2 = end.x - (dx / dist) * (nodeSizeEnd + padding);
            const y2 = end.y - (dy / dist) * (nodeSizeEnd + padding);
            
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1); line.setAttribute("y1", y1);
            line.setAttribute("x2", x2); line.setAttribute("y2", y2);
            line.setAttribute("stroke", "#ffe0e6"); 
            line.setAttribute("stroke-width", "2");
            line.setAttribute("marker-end", "url(#arrowhead)");
            svg.appendChild(line);
        }
    }
}