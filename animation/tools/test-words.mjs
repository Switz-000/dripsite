// npm run test:words: checks the whisper.cpp -> words converter on a known transcript.
import { toWords, dtwPreset } from './word-timings.mjs'
const tok = (text, from, to, dtw, p=0.9) => ({ text, offsets:{from, to}, id:1, p, t_dtw: dtw })
const json = { transcription: [
  { offsets:{from:0,to:2100}, text:" Do you know what they're doing?", tokens:[
    tok('[_BEG_]',0,0,-1), tok(' Do',300,450,32), tok(' you',450,560,47), tok(' know',560,800,58), tok(' what',800,1000,83),
    tok(' they',1000,1150,102), tok("'re",1150,1250,116), tok(' doing',1250,1700,128), tok('?',1700,1750,170), tok('[_TT_105]',2100,2100,-1) ] },
  { offsets:{from:2400,to:4800}, text:" Do you actually understand?", tokens:[
    tok(' Do',2400,2550,243), tok(' you',2550,2650,256), tok(' act',2650,2900,268), tok('ually',2900,3200,-1,0.6), tok(' understand',3200,4100,322), tok('?',4100,4150,410) ] } ] }
const w = toWords(json)

const ok = w.length === 10 && w[4].w === "they're" && w[5].w === 'doing?' && w[8].w === 'actually' && w[8].p === 0.6 && w[5].end <= 1.91 && w[0].end === 0.47 && w.every(x => x.end > x.start)
const presets = ['ggml-large-v3.bin','ggml-large-v3-turbo.bin','for-tests-ggml-tiny.en.bin','ggml-medium.en-q5_0.bin','weird.bin'].map(dtwPreset).join()
const ok2 = presets === 'large.v3,large.v3.turbo,tiny.en,medium.en,'
console.log((ok ? 'PASS' : 'FAIL') + '  words, timings and punctuation from a whisper.cpp transcript')
console.log((ok2 ? 'PASS' : 'FAIL') + '  alignment preset picked from the model file name (' + presets + ')')
process.exit((ok ? 0 : 1) + (ok2 ? 0 : 1))
