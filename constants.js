const FRUIT_TYPES = [
    { name: 'さくらんぼ', radius: 27, color: '#ff4d6d', score: 2, emoji: '🍒' },
    { name: 'いちご', radius: 37.5, color: '#ff758f', score: 4, emoji: '🍓' },
    { name: 'ぶどう', radius: 48, color: '#c0b9dd', score: 8, emoji: '🍇' },
    { name: 'デコポン', radius: 60, color: '#ffb3c1', score: 16, emoji: '🍊' },
    { name: 'かき', radius: 75, color: '#ff85a1', score: 32, emoji: '🍅' },
    { name: 'りんご', radius: 93, color: '#ff4d6d', score: 64, emoji: '🍎' },
    { name: 'なし', radius: 112.5, color: '#fff0f3', score: 128, emoji: '🍐' },
    { name: 'もも', radius: 132, color: '#ffccd5', score: 256, emoji: '🍑' },
    { name: 'パイナップル', radius: 157.5, color: '#fff0f3', score: 512, emoji: '🍍' },
    { name: 'メロン', radius: 187.5, color: '#c1d37f', score: 1024, emoji: '🍈' },
    { name: 'スイカ', radius: 225, color: '#81b29a', score: 2048, emoji: '🍉' }
];

// ここにGASのウェブアプリURLを貼り付けてください
const API_URL = 'https://script.google.com/macros/s/AKfycbwvsk6Xk3vWLtZqFTM0Go-Q-_MRhP3RtEq01dTRMVRDtyMS9bMgMwTjI1s8Wk_kaVzq2g/exec';

const HIGH_SCORE_KEY = 'vibe_suika_highscore';