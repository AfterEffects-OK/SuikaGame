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

// タイムマシーン録画用変数
let mediaRecorder = null;
let recordingDest = null;
let recordedChunks = []; // 録画データを保持するリングバッファ
const MAX_RECORDING_CHUNKS = 60; // 録画する最大チャンク数（約60秒）

function init() {
    if (isGameInitialized) return;    
    setupGamePhysics();
    setupContainerEvents();
    prepareNextFruit();
    createVisualEvolutionPath();
    setupTimeMachine(); // 録画開始
    
    adjustGameScale();
    window.addEventListener('resize', adjustGameScale);
    
    // ユーザー操作時にAudioContextを確実に再開して、録画の音ズレを防ぐ
    const resumeAudio = () => {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        document.removeEventListener('click', resumeAudio);
        document.removeEventListener('touchstart', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
    document.addEventListener('touchstart', resumeAudio);
    
    isGameInitialized = true;
}

function startGame(enableGyro = false) {
    // 設定の読み込み
    const savedBgm = localStorage.getItem('vibe_suika_bgm');
    const savedSe = localStorage.getItem('vibe_suika_se');

    if (savedBgm !== null) isBgmEnabled = (savedBgm === 'true');
    if (savedSe !== null) isSeEnabled = (savedSe === 'true');

    // DOMの準備は完了している
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

function playShutterSound() {
    if (!isSeEnabled) return;
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    // シャッター音（ノイズバースト）
    const t = audioCtx.currentTime;
    const bufferSize = audioCtx.sampleRate * 0.1;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.5, t);
    gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    // フィルタで少し音を丸める
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    if (recordingDest) gainNode.connect(recordingDest); // 録画用音声出力
    
    noise.start(t);
}

function takeScreenshot() {
    const btn = document.getElementById('btn-screenshot');
    const msg = document.getElementById('screenshot-message');
    if (btn) btn.style.display = 'none'; // 撮影時にボタンを一時的に隠す
    if (msg) msg.classList.remove('hidden'); // 保存中メッセージを表示

    // シャッター音とフラッシュ
    playShutterSound();
    const flash = document.getElementById('flash-overlay');
    if (flash) {
        flash.classList.remove('flash-active');
        void flash.offsetWidth; // リフロー強制
        flash.classList.add('flash-active');
    }

    // メッセージ描画のために少し待つ
    setTimeout(() => {
        const target = document.getElementById('main-wrapper');
        
        // html2canvas用に一時的にスタイルを調整（box-shadowのレイヤー順序問題を回避）
        const originalBoxShadows = [];
        const containers = target.querySelectorAll('.score-container, .next-container, .evo-center-label, .side-btn');
        
        containers.forEach(el => {
            originalBoxShadows.push({
                element: el,
                boxShadow: el.style.boxShadow,
                borderBottom: el.style.borderBottom
            });
            el.style.boxShadow = 'none';
            el.style.borderBottom = '8px solid #ffe0e6'; // var(--border-color)
        });

        html2canvas(target, {
            backgroundColor: '#fff9f0', // 背景色を指定（透過防止）
            scale: 1, // スケールを1に固定して影のズレを防ぐ（高解像度化は諦めるがレイアウト崩れを優先して防ぐ）
            useCORS: true, // 外部リソース（フォントなど）の読み込みを許可
            ignoreElements: (element) => element.id === 'flash-overlay' || element.id === 'screenshot-message' // フラッシュとメッセージを無視
        }).then(async canvas => {
            const useSaveDialog = localStorage.getItem('vibe_suika_save_dialog') === 'true';
            
            // スタイルを元に戻す
            originalBoxShadows.forEach(item => {
                item.element.style.boxShadow = item.boxShadow;
                item.element.style.borderBottom = item.borderBottom;
            });

            
            // 保存ダイアログ設定がONで、かつブラウザが対応している場合
            if (useSaveDialog && window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: `suika-game_${Date.now()}.png`,
                        types: [{
                            description: 'PNG Image',
                            accept: {'image/png': ['.png']},
                        }],
                    });
                    const writable = await handle.createWritable();
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    await writable.write(blob);
                    await writable.close();
                } catch (err) {
                    console.log('Save cancelled or failed', err);
                }
            } else {
                // 通常のダウンロード（設定OFFまたは非対応ブラウザ）
                const link = document.createElement('a');
                link.download = `suika-game_${Date.now()}.png`;
                link.href = canvas.toDataURL();
                link.click();
            }
            if (btn) btn.style.display = 'block'; // ボタンを表示に戻す
            if (msg) msg.classList.add('hidden'); // メッセージを隠す

            // シェアモーダルを表示
            const shareModal = document.getElementById('share-modal');
            if (shareModal) shareModal.classList.remove('hidden');
            
        });
    }, 50);
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
        options: { width: WORLD_WIDTH, height: WORLD_HEIGHT, wireframes: false, background: 'transparent', preserveDrawingBuffer: true }
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
    const savedVolume = localStorage.getItem('vibe_suika_bgm_volume');
    bgm.volume = savedVolume !== null ? parseFloat(savedVolume) : 0.1;
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
    if (recordingDest) gainNode.connect(recordingDest); // 録画用音声出力
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
    // 背景パターンの作成（録画にも反映させるためCanvasに描画）
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 30;
    patternCanvas.height = 30;
    const pCtx = patternCanvas.getContext('2d');
    pCtx.fillStyle = '#ffffff';
    pCtx.fillRect(0, 0, 30, 30);
    pCtx.fillStyle = 'rgba(255, 143, 163, 0.08)';
    pCtx.beginPath();
    pCtx.arc(15, 15, 2, 0, Math.PI * 2);
    pCtx.fill();
    const bgPattern = render.context.createPattern(patternCanvas, 'repeat');

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

        // 背景を描画（destination-overで最背面に描画）
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        
        // 1. パターンを描画（もしパターンが無効ならクリーム色を使う安全策）
        ctx.fillStyle = bgPattern || '#ffffff';
        ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        
        // 2. さらにその奥にベース色を塗りつぶす（パターンの透過部分や読み込み失敗時の黒背景化を防止）
        // destination-overなので、1で描画したものの「後ろ」に描画されます
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        
        ctx.restore();

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

        let maxFruitIndex = 0;
        allBodies.forEach(body => {
            if (body.label && body.label.startsWith('fruit_')) {
                if (body.fruitIndex > maxFruitIndex) maxFruitIndex = body.fruitIndex;
            }
        });

        // 結果表示ボタンを作成
        const resultButton = document.createElement('button');
        resultButton.innerText = '結果をみる';
        resultButton.id = 'show-result-btn';
        resultButton.disabled = false;
        const handleShowResult = async (e) => {
            // 親要素へのイベント伝播を止めて、フルーツがドロップされるのを防ぐ
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            // 処理が二重に実行されるのを防ぐ
            if (resultButton.disabled) return;

            // ボタンを無効化して連打防止
            resultButton.disabled = true;
            resultButton.innerText = 'しょりちゅう...';

            // 録画が実行中なら停止する
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                // 録画停止処理。ブラウザや状況によってこの処理が固まることがあるため、
                // 安全策としてタイムアウト（時間切れ）を設けて、必ず次の処理へ進むようにします。
                await new Promise(resolve => {
                    const timeoutId = setTimeout(() => {
                        console.warn('MediaRecorder.stop() timed out. Navigating anyway.');
                        mediaRecorder.onstop = null; // タイムアウト後にonstopが発火するのを防ぐ
                        resolve();
                    }, 1000); // タイムアウトを1秒に延長

                    mediaRecorder.onstop = () => {
                        clearTimeout(timeoutId);
                        resolve();
                    };
                    mediaRecorder.stop();
                });
            }

            if (recordedChunks.length > 0) {
                const mimeType = mediaRecorder.mimeType || 'video/webm';
                const blob = new Blob(recordedChunks, { type: mimeType });
                try {
                    await saveRecordingToDB(blob);
                } catch (e) {
                    console.warn('DBへの録画データ保存に失敗しました:', e);
                }
            }
            window.location.href = `result.html?score=${score}&maxFruit=${maxFruitIndex}`;
        };
        // PCでのクリックと、スマホでのタップ(touchend)の両方に対応
        resultButton.addEventListener('click', handleShowResult);
        resultButton.addEventListener('touchend', handleShowResult);

        // style.cssのbuttonスタイルを適用しつつ、位置やサイズを調整
        resultButton.style.position = 'absolute';
        resultButton.style.top = '65%';
        resultButton.style.left = '50%';
        resultButton.style.transform = 'translateX(-50%)';
        resultButton.style.zIndex = '201';
        resultButton.style.width = '80%';
        resultButton.style.maxWidth = '300px';
        resultButton.style.padding = '15px 0';
        resultButton.style.fontSize = '24px';
        resultButton.style.display = 'flex';
        resultButton.style.justifyContent = 'center';
        resultButton.style.alignItems = 'center';
        resultButton.style.whiteSpace = 'nowrap'; // テキストの改行を防止してズレを防ぐ
        resultButton.style.margin = '0'; // 余計なマージンを排除
        document.getElementById('game-container').appendChild(resultButton);
    }
}

// ページ読み込み時に自動開始
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    startGame(urlParams.get('gyro') === 'true');
});

function createVisualEvolutionPath() {
    const container = document.getElementById('evolution-visualizer');
    if (!container) return;
    
    // リサイズ対応のため、既存の要素をクリアして再生成
    const existingNodes = container.querySelectorAll('.evo-item-node');
    existingNodes.forEach(node => node.remove());

    const svg = document.getElementById('evolution-arrows-svg');
    if (svg) {
        const lines = svg.querySelectorAll('line');
        lines.forEach(line => line.remove());
    }

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

// --- タイムマシーン録画機能 ---

function setupTimeMachine() {
    if (!render || !render.canvas) return;

    // 音声コンテキストの確認と録画用出力ノードの作成
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!recordingDest) {
        recordingDest = audioCtx.createMediaStreamDestination();
        
        // 無音のオシレーターを常に接続して、録画中の音声トラックが途切れないようにする（音ズレ防止）
        const silentOsc = audioCtx.createOscillator();
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0; // 完全な無音
        silentOsc.connect(silentGain);
        silentGain.connect(recordingDest);
        silentOsc.start();
    }

    // Canvasのストリームを取得 (30fps固定で等倍速記録を保証)
    const canvasStream = render.canvas.captureStream(30);
    
    // 映像と音声を結合 (BGMはAudioタグなので録音されませんが、SEは録音されます)
    const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...recordingDest.stream.getAudioTracks()
    ]);

    startContinuousRecording(combinedStream);
}

function startContinuousRecording(stream) {
    recordedChunks = [];

    try {
        // SNS投稿しやすいMP4を優先し、だめならWebMにフォールバック
        const mimeTypes = [
            'video/mp4;codecs=avc1.4d002a,mp4a.40.2', // H.264 (High Profile)
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];
        
        // ビットレートを指定して画質と安定性を確保
        let options = { mimeType: '', videoBitsPerSecond: 2500000 };
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                options.mimeType = type;
                break;
            }
        }
        mediaRecorder = new MediaRecorder(stream, options.mimeType ? options : { videoBitsPerSecond: 2500000 });
    } catch (e) {
        console.warn('MediaRecorder not supported', e);
        return;
    }

    // 1秒ごとにデータを取得（timeslice: 1000ms）
    mediaRecorder.start(1000);

    mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
            recordedChunks.push(e.data);
            if (recordedChunks.length > MAX_RECORDING_CHUNKS) {
                recordedChunks.shift(); // 古いチャンクから削除してリングバッファとして機能させる
            }
        }
    };
}

function saveTimeMachineVideo() {
    if (!mediaRecorder || recordedChunks.length === 0) return;

    const btn = document.getElementById('btn-timemachine');
    const msg = document.getElementById('screenshot-message');
    
    // ボタンを無効化して連打防止
    if (btn) btn.disabled = true;
    
    if (msg) {
        msg.innerText = "どうがをほぞんちゅう...";
        msg.classList.remove('hidden');
    }

    const processAndSave = () => {
        const mimeType = mediaRecorder.mimeType || 'video/webm';
        const fullBlob = new Blob(recordedChunks, { type: mimeType });
        const timestamp = Date.now();
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

        const link = document.createElement('a');
        link.href = URL.createObjectURL(fullBlob);
        link.download = `suika-replay_${timestamp}.${ext}`;
        link.click();

        // ゲームオーバーでない場合のみ、録画をリセットして再開
        if (!isGameOver) {
            recordedChunks = [];
            if (mediaRecorder.state === 'inactive') {
                mediaRecorder.start(1000);
            }
        }

        if (msg) msg.classList.add('hidden');
        if (msg) msg.innerText = "ほぞんちゅう...";

        const saveModal = document.getElementById('video-save-modal-game');
        if (saveModal) saveModal.style.display = 'flex';

        if (btn) btn.disabled = false;
    };

    // 録画を停止し、onstopイベントで保存処理を実行
    if (mediaRecorder.state === 'recording') {
        mediaRecorder.onstop = processAndSave;
        mediaRecorder.stop();
    } else {
        // すでに停止している場合は、現在のチャンクでそのまま保存
        processAndSave();
    }
}

function shareToX() {
    const text = "スイカゲーム風のゲームで遊びました！\n進化したフルーツを見て！\n#SuikaGameEvolution";
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

function shareToInsta() {
    // Instagramアプリを起動（スマホ用）
    // PCやアプリがない場合はWebサイトへ
    setTimeout(() => {
        window.open('https://www.instagram.com/', '_blank');
    }, 500);
    window.location.href = 'instagram://app';
}

function shareToLine() {
    const text = "スイカゲーム風のゲームで遊びました！進化したフルーツを見て！ #SuikaGameEvolution";
    // LINEでシェア（テキストのみ）
    const url = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

function closeShareModal() {
    document.getElementById('share-modal').classList.add('hidden');
}

// IndexedDBへの保存ヘルパー
function saveRecordingToDB(blob) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SuikaGameDB', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('recordings')) {
                db.createObjectStore('recordings');
            }
        };
        request.onsuccess = (e) => {
            const db = e.target.result;
            const transaction = db.transaction(['recordings'], 'readwrite');
            const store = transaction.objectStore('recordings');
            const putRequest = store.put(blob, 'lastGame');
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = (err) => reject(err);
        };
        request.onerror = (err) => reject(err);
    });
}

function adjustGameScale() {
    const wrapper = document.getElementById('main-wrapper');
    const container = document.getElementById('game-container');

    // サイズ計測前にボタンのスタイルを確定させる（改行禁止を反映させるため）
    const buttons = document.querySelectorAll('#btn-screenshot, #btn-timemachine, #btn-give-up');
    buttons.forEach(btn => {
        if (btn) {
            // 計測時は親コンテナを押し広げるために auto / max-content に設定
            btn.style.width = 'auto';
            btn.style.minWidth = 'max-content';
            btn.style.boxSizing = 'border-box';
            btn.style.whiteSpace = 'nowrap';
            
            // あきらめるボタンの幅を1文字分広く確保（左右に余白を追加）
            if (btn.id === 'btn-give-up') {
                btn.style.paddingLeft = '1em';
                btn.style.paddingRight = '1em';
            }
        }
    });

    // 画面の余白
    const padding = 20;
    const availableWidth = window.innerWidth - padding;
    const availableHeight = window.innerHeight - padding;

    if (wrapper) {
        // リセットして本来のサイズを計測
        wrapper.style.transform = '';
        wrapper.style.width = '';
        wrapper.style.height = '';
        wrapper.style.position = '';
        wrapper.style.left = '';
        wrapper.style.top = '';
        wrapper.style.margin = '';
        
        // ゲームコンテナの個別サイズ指定を解除
        if (container) {
            container.style.width = '';
            container.style.height = '';
            container.style.marginTop = '';
            container.style.marginLeft = '';
            container.style.marginRight = '';
            const canvas = container.querySelector('canvas');
            if (canvas) {
                canvas.style.width = '';
                canvas.style.height = '';
            }
        }

        // 折り返しによる縦伸びを防ぐため、一時的に幅をコンテンツに合わせて固定
        wrapper.style.width = 'max-content';
        const contentWidth = wrapper.offsetWidth;
        const contentHeight = wrapper.offsetHeight;

        const scale = Math.min(
            availableWidth / contentWidth,
            availableHeight / contentHeight,
            1
        );

        // 画面中央に配置し、中心を基準にスケール
        wrapper.style.position = 'absolute';
        wrapper.style.left = '50%';
        wrapper.style.top = '50%';
        wrapper.style.width = `${contentWidth}px`;
        wrapper.style.height = `${contentHeight}px`;
        wrapper.style.transformOrigin = 'center center';
        wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;

        // 計測完了後、ボタンの幅をコンテナいっぱい（100%）に戻す
        buttons.forEach(btn => {
            if (btn) {
                btn.style.width = '100%';
            }
        });

    } else if (container) {
        // main-wrapperがない場合のフォールバック（ゲーム画面のみ縮小）
        const scale = Math.min(
            availableWidth / WORLD_WIDTH,
            availableHeight / WORLD_HEIGHT,
            1
        );

        container.style.position = 'absolute';
        container.style.left = '50%';
        container.style.top = '50%';
        container.style.transformOrigin = 'center center';
        container.style.transform = `translate(-50%, -50%) scale(${scale})`;
        
        container.style.width = `${WORLD_WIDTH}px`;
        container.style.height = `${WORLD_HEIGHT}px`;
        container.style.margin = '0';

        const canvas = container.querySelector('canvas');
        if (canvas) {
            canvas.style.width = '100%';
            canvas.style.height = '100%';
        }
    }

    // レイアウト変更に合わせて進化図を再描画
    createVisualEvolutionPath();
}