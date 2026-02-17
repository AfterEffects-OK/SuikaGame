// constants.js の後に読み込まれることを想定しています。
let isBgmEnabled = true;
let isSeEnabled = true;
let isBgmPlaying = false;

/**
 * メニュー背景用のデモアニメーションを開始します。
 */
function startDemo() {
    const container = document.getElementById('demo-container');
    if (!container || typeof Matter === 'undefined') return;

    const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;
    const width = window.innerWidth;
    const height = window.innerHeight;

    const engine = Engine.create();
    const render = Render.create({
        element: container,
        engine: engine,
        options: {
            width: width,
            height: height,
            background: 'transparent',
            wireframes: false,
            pixelRatio: window.devicePixelRatio
        }
    });

    // 床と壁（画面外）
    const wallOptions = { isStatic: true, render: { visible: false } };
    const floor = Bodies.rectangle(width / 2, height + 60, width, 120, wallOptions);
    const leftWall = Bodies.rectangle(-60, height / 2, 120, height * 2, wallOptions);
    const rightWall = Bodies.rectangle(width + 60, height / 2, 120, height * 2, wallOptions);

    Composite.add(engine.world, [floor, leftWall, rightWall]);

    // フルーツ生成ヘルパー
    function createDemoFruit(x, y, index) {
        const fruitType = FRUIT_TYPES[index];
        const fruit = Bodies.circle(x, y, fruitType.radius, {
            restitution: 0.5,
            friction: 0.1,
            render: { fillStyle: fruitType.color },
            label: 'fruit_' + index
        });
        fruit.fruitIndex = index;
        return fruit;
    }

    // 衝突イベント（進化ロジック）
    Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach((pair) => {
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;
            if (bodyA.fruitIndex !== undefined && bodyB.fruitIndex !== undefined && bodyA.fruitIndex === bodyB.fruitIndex) {
                const index = bodyA.fruitIndex;
                if (index < FRUIT_TYPES.length - 1) {
                    Composite.remove(engine.world, [bodyA, bodyB]);
                    Composite.add(engine.world, createDemoFruit((bodyA.position.x + bodyB.position.x) / 2, (bodyA.position.y + bodyB.position.y) / 2, index + 1));
                }
            }
        });
    });

    Runner.run(Runner.create(), engine);
    Render.run(render);

    // フルーツを定期的に降らせる
    setInterval(() => {
        if (document.hidden) return;
        
        // 画面内にフルーツが多すぎたら、下にあるものから削除して循環させる
        const bodies = Composite.allBodies(engine.world);
        const fruits = bodies.filter(b => b.label && b.label.startsWith('fruit_'));

        if (fruits.length > 50) {
            // 下にある順（y座標が大きい順）にソートして、下の数個を削除
            fruits.sort((a, b) => b.position.y - a.position.y);
            Composite.remove(engine.world, fruits.slice(0, 5));
        }

        const index = Math.floor(Math.random() * 5); // 小さめのフルーツ
        const x = Math.random() * (width - 100) + 50;
        
        Composite.add(engine.world, createDemoFruit(x, -100, index));
    }, 800);

    // リサイズ対応
    window.addEventListener('resize', () => {
        render.canvas.width = window.innerWidth;
        render.canvas.height = window.innerHeight;
    });
}

/**
 * 遊び方画面を表示します。
 */
function showHowTo() {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('how-to-screen').classList.remove('hidden');
    
    const container = document.getElementById('fruit-list-container');
    if (container.children.length === 0) {
        FRUIT_TYPES.forEach((fruit, index) => {
            const item = document.createElement('div');
            item.className = 'fruit-item';
            item.innerHTML = `<div class="fruit-emoji">${fruit.emoji}</div><div class="fruit-score">${fruit.score}</div>`;
            container.appendChild(item);
            
            if (index < FRUIT_TYPES.length - 1) {
                const arrow = document.createElement('div');
                arrow.className = 'arrow-next';
                arrow.innerHTML = '→';
                container.appendChild(arrow);
            }
        });
    }
    createVisualEvolutionPath();
}

/**
 * スコア画面を表示します。
 */
function showScores() {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('high-score-screen').classList.remove('hidden');
    
    // デフォルトでハイスコアタブを表示
    showTab('highscore');

    // ハイスコア表示
    const highScore = localStorage.getItem(HIGH_SCORE_KEY) || 0;
    document.getElementById('high-score-value').innerText = highScore;

    // ランキング表示
    const list = document.getElementById('ranking-list-container');
    list.innerHTML = '<div style="padding:20px; text-align:center;">読み込み中...</div>';
    
    fetch(API_URL)
    .then(response => response.json())
    .then(data => {
        list.innerHTML = '';
        if (data.length === 0) {
            list.innerHTML = '<div style="padding:20px; text-align:center;">データがありません</div>';
            return;
        }
        data.forEach((record, index) => {
            const row = document.createElement('div');
            row.className = 'ranking-row';
            const fruitEmoji = FRUIT_TYPES[record.maxFruit] ? FRUIT_TYPES[record.maxFruit].emoji : '';
            row.innerHTML = `<div class="rank-badge">${index + 1}</div><div class="rank-info"><div class="rank-name">${record.name || 'ななし'}</div><div class="rank-score">${record.score}</div><div class="rank-date">${record.date}</div></div><div class="rank-fruit">${fruitEmoji}</div>`;
            list.appendChild(row);
        });
    })
    .catch(error => {
        console.error('Error:', error);
        let errorMsg = '読み込みエラー';
        if (error.name === 'SyntaxError') {
            errorMsg = '設定エラー<br><span style="font-size:10px">GASの公開設定を「全員」にしてください</span>';
        }
        list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--accent-pink);">${errorMsg}</div>`;
    });
}

/**
 * 各画面からタイトル画面に戻ります。
 */
function returnToTitle() {
    document.getElementById('how-to-screen').classList.add('hidden');
    document.getElementById('high-score-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
}

/**
 * スコア画面のタブを切り替えます。
 * @param {'highscore' | 'ranking'} tabName 表示するタブの名前
 */
function showTab(tabName) {
    document.getElementById('highscore-content').classList.add('hidden');
    document.getElementById('ranking-content').classList.add('hidden');
    document.getElementById('tab-btn-highscore').classList.remove('active');
    document.getElementById('tab-btn-ranking').classList.remove('active');

    if (tabName === 'highscore') {
        document.getElementById('highscore-content').classList.remove('hidden');
        document.getElementById('tab-btn-highscore').classList.add('active');
    } else {
        document.getElementById('ranking-content').classList.remove('hidden');
        document.getElementById('tab-btn-ranking').classList.add('active');
    }
}

/**
 * 遊び方画面に表示するフルーツの進化図を生成します。
 */
function createVisualEvolutionPath() {
    const container = document.getElementById('evolution-visualizer');
    if (!container) return;
    // 既に生成済みの場合は処理を中断
    if (container.children.length > 1) return;

    const svg = document.getElementById('evolution-arrows-svg');
    const total = FRUIT_TYPES.length;
    const size = container.offsetWidth;
    const centerX = size / 2;
    const centerY = size / 2;
    const scaleFactor = size / 380; // 基本サイズからの縮小率
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
        line.setAttribute("stroke", "#ffe0e6"); line.setAttribute("stroke-width", "2");
        line.setAttribute("marker-end", "url(#arrowhead)");
        svg.appendChild(line);
    }
}

function playBgm() {
    if (!isBgmEnabled || isBgmPlaying) return;
    const bgm = document.getElementById('bgm');
    bgm.volume = 0.1;
    bgm.play().then(() => {
        isBgmPlaying = true;
    }).catch(e => console.log("Audio play failed", e));
}

/**
 * BGMとSEのオン/オフ設定を初期化し、イベントリスナーを登録します。
 */
function setupSettings() {
    const bgmToggle = document.getElementById('bgm-toggle');
    const seToggle = document.getElementById('se-toggle');
    const saveDialogToggle = document.getElementById('save-dialog-toggle');

    // 設定の読み込み
    const savedBgm = localStorage.getItem('vibe_suika_bgm');
    const savedSe = localStorage.getItem('vibe_suika_se');
    const savedSaveDialog = localStorage.getItem('vibe_suika_save_dialog');

    if (savedBgm !== null) isBgmEnabled = (savedBgm === 'true');
    if (savedSe !== null) isSeEnabled = (savedSe === 'true');
    
    if (bgmToggle) {
        bgmToggle.checked = isBgmEnabled;
        bgmToggle.addEventListener('change', (e) => {
            isBgmEnabled = e.target.checked;
            localStorage.setItem('vibe_suika_bgm', isBgmEnabled);
            const bgm = document.getElementById('bgm');
            if (isBgmEnabled) {
                playBgm();
            } else {
                bgm.pause();
                isBgmPlaying = false;
            }
        });
    }
    if (seToggle) {
        seToggle.checked = isSeEnabled;
        seToggle.addEventListener('change', (e) => {
            isSeEnabled = e.target.checked;
            localStorage.setItem('vibe_suika_se', isSeEnabled);
        });
    }
    if (saveDialogToggle) {
        saveDialogToggle.checked = (savedSaveDialog === 'true');
        saveDialogToggle.addEventListener('change', (e) => {
            localStorage.setItem('vibe_suika_save_dialog', e.target.checked);
        });
    }
}

// --- イベントリスナーと初期化処理 ---

// DOMが読み込まれたら、メニュー関連のイベントリスナーを登録
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('btn-game-start');
    const howToBtn = document.getElementById('btn-how-to');
    const scoresBtn = document.getElementById('btn-scores');
    const backBtns = document.querySelectorAll('.btn-back-to-title');
    const highScoreTabBtn = document.getElementById('tab-btn-highscore');
    const rankingTabBtn = document.getElementById('tab-btn-ranking');

    // ゲームスタートボタン（シングル/ダブルタップ判定）
    if (startBtn) {
        let clickCount = 0;
        let clickTimer = null;
        startBtn.addEventListener('click', (e) => {
            clickCount++;
            if (clickCount === 1) {
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                    window.location.href = 'game.html'; // 通常スタート
                }, 300);
            } else {
                clearTimeout(clickTimer);
                clickCount = 0;
                window.location.href = 'game.html?gyro=true'; // ダブルタップ：ジャイロ有効
            }
        });
    }

    // その他のメニューボタン
    if (howToBtn) howToBtn.addEventListener('click', showHowTo);
    if (scoresBtn) scoresBtn.addEventListener('click', showScores);
    if (backBtns) backBtns.forEach(btn => btn.addEventListener('click', returnToTitle));
    if (highScoreTabBtn) highScoreTabBtn.addEventListener('click', () => showTab('highscore'));
    if (rankingTabBtn) rankingTabBtn.addEventListener('click', () => showTab('ranking'));

    // 設定の初期化
    setupSettings();

    // デモ開始
    startDemo();
});