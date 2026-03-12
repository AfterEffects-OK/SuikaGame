const FRUIT_TYPES = [
    { name: 'さくらんぼ', emoji: '🍒' },
    { name: 'いちご', emoji: '🍓' },
    { name: 'ぶどう', emoji: '🍇' },
    { name: 'デコポン', emoji: '🍊' },
    { name: 'かき', emoji: '🍅' },
    { name: 'りんご', emoji: '🍎' },
    { name: 'なし', emoji: '🍐' },
    { name: 'もも', emoji: '🍑' },
    { name: 'パイナップル', emoji: '🍍' },
    { name: 'メロン', emoji: '🍈' },
    { name: 'スイカ', emoji: '🍉' }
];

// ここにGASのウェブアプリURLを貼り付けてください
const API_URL = 'https://script.google.com/macros/s/AKfycbwvsk6Xk3vWLtZqFTM0Go-Q-_MRhP3RtEq01dTRMVRDtyMS9bMgMwTjI1s8Wk_kaVzq2g/exec';

const params = new URLSearchParams(window.location.search);
const score = params.get('score') || 0;
const maxFruitIndex = parseInt(params.get('maxFruit') || 0);
const HIGH_SCORE_KEY = 'vibe_suika_highscore';

document.getElementById('score').innerText = score;
document.getElementById('high-score').innerText = localStorage.getItem(HIGH_SCORE_KEY) || 0;

// 最大フルーツ表示
if (FRUIT_TYPES[maxFruitIndex]) {
    document.getElementById('max-fruit-icon').innerText = FRUIT_TYPES[maxFruitIndex].emoji;
    document.getElementById('max-fruit-name').innerText = FRUIT_TYPES[maxFruitIndex].name;
}

// 進化チャート生成
const chartContainer = document.getElementById('evolution-chart');
FRUIT_TYPES.forEach((fruit, index) => {
    const item = document.createElement('div');
    item.className = 'evo-item';
    if (index <= maxFruitIndex) {
        item.classList.add('reached');
    }
    item.innerText = fruit.emoji;
    chartContainer.appendChild(item);
});

// 紙吹雪エフェクト
function createConfetti() {
    const colors = ['#ff8fa3', '#ffb3c1', '#c0b9dd', '#fff0f3', '#ffccd5'];
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = -10 + 'px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
        document.body.appendChild(confetti);
        
        setTimeout(() => confetti.remove(), 5000);
    }
}
createConfetti();

// ボタン機能
function retryGame() {
    window.location.href = 'game.html?retry=true';
}

function goToMenu() {
    window.location.href = 'index.html';
}

let isSaved = false;
let lastRankingId = null;

function generateRankingId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    do {
        id = '';
        for (let i = 0; i < 8; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (/^\d+$/.test(id)); // すべて数字の場合は再生成
    return id;
}

function saveResult() {
    if (!isSaved) {
        document.getElementById('name-input-modal').classList.add('show');
        document.getElementById('player-name-input').focus();
    } else {
        showRanking();
    }
}

function closeNameInput() {
    document.getElementById('name-input-modal').classList.remove('show');
}

function submitName() {
    const nameInput = document.getElementById('player-name-input');
    const name = nameInput.value.trim() || "ななし";
    
    closeNameInput();

    if (!isSaved) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        const rankingId = generateRankingId();
        lastRankingId = rankingId;
        const newRecord = {
            id: rankingId,
            name: name,
            date: dateStr,
            score: score,
            maxFruit: maxFruitIndex
        };
        
        const btn = document.getElementById('btn-record');
        btn.innerText = '送信中...';
        btn.disabled = true;

        fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(newRecord)
        })
        .then(response => response.json())
        .then(data => {
            btn.innerText = 'ランキングをみる';
            btn.disabled = false;
            isSaved = true;
            showRanking();
        })
        .catch(error => {
            console.error('Error:', error);
            btn.innerText = '送信エラー';
            btn.disabled = false;
            alert('送信に失敗しました。\nGASの公開設定が「全員」になっているか確認してください。');
        });
    }
}

function showRanking() {
    const list = document.getElementById('ranking-list');
    list.innerHTML = '<div style="padding:20px; text-align:center;">読み込み中...</div>';
    
    fetch(API_URL)
    .then(response => response.json())
    .then(data => {
        list.innerHTML = '';
        data.forEach((record, index) => {
            const row = document.createElement('div');
            row.className = 'ranking-row';
            if (lastRankingId && record.id === lastRankingId) {
                row.classList.add('current-rank');
            }
            const fruitEmoji = FRUIT_TYPES[record.maxFruit] ? FRUIT_TYPES[record.maxFruit].emoji : '';
            row.innerHTML = `<div class="rank-badge">${index + 1}</div><div class="rank-info"><div class="rank-name">${record.name || 'ななし'}</div><div class="rank-score">${record.score}</div><div class="rank-date">${record.date}</div></div><div class="rank-fruit">${fruitEmoji}</div>`;
            list.appendChild(row);
        });

        // 自分のランキング位置までスクロール
        setTimeout(() => {
            const current = list.querySelector('.current-rank');
            if (current) {
                current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    })
    .catch(error => {
        console.error('Error:', error);
        let errorMsg = '読み込みエラー';
        if (error.name === 'SyntaxError') {
            errorMsg = '設定エラー<br><span style="font-size:10px">GASの公開設定を「全員」にしてください</span>';
        }
        list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--accent-pink);">${errorMsg}</div>`;
    });
    
    document.getElementById('ranking-modal').classList.add('show');
}

function closeRanking() {
    document.getElementById('ranking-modal').classList.remove('show');
}

// --- 動画保存機能 ---

// IndexedDBから録画データを取得
function getRecordingFromDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SuikaGameDB', 1);
        request.onsuccess = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('recordings')) {
                resolve(null);
                return;
            }
            const transaction = db.transaction(['recordings'], 'readonly');
            const store = transaction.objectStore('recordings');
            const getRequest = store.get('lastGame');
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
    });
}

let videoBlob = null;

// 動画保存ボタンの処理
function saveVideo() {
    if (!videoBlob) return;
    
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    
    // 拡張子の決定
    const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const timestamp = new Date().getTime();
    a.download = `suika-game-replay_${timestamp}.${ext}`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}

// ページ読み込み時に録画データをチェック
document.addEventListener('DOMContentLoaded', async () => {
    const saveVideoBtn = document.getElementById('btn-save-video');
    if (saveVideoBtn) {
        saveVideoBtn.style.display = 'none'; // 初期状態は非表示
        
        try {
            const blob = await getRecordingFromDB();
            if (blob) {
                videoBlob = blob;
                saveVideoBtn.style.display = 'block'; // データがあれば表示
            }
        } catch (e) {
            console.error('Error checking for video:', e);
        }
    }
});