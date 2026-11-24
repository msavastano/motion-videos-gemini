# From Neuron to Transformer — Script & Shot List

- **Film slug**: `films/whiteboard-ai`
- **Format**: 1920 × 1080 (16:9), 24 fps, ~105 s target (locked to aligned Gemini TTS `vo.json`)
- **Voice**: `Charon` (`gemini-3.8-flash-tts`), 234 spoken words (~2.4 words/s)
- **Music**: Lyria 3 Pro (`lyria-3-pro-preview`), light, curious instrumental bed ducked under narration

---

## Narration Script (with visual cues)

1. **`s01_neuron` (0.0 – 17.5 s, 37 words)**
   > Every neural network begins with one `[[inputs]]` simple unit: an artificial neuron. It takes numbers in, multiplies each by a `[[weights]]` weight, adds them `[[sum]]` together, and passes the total through an `[[activation]]` activation curve—deciding how `[[neuron_alive]]` strongly to fire.

2. **`s02_network` (17.5 – 35.5 s, 42 words)**
   > Wire thousands of these neurons into `[[layers]]` stacked layers, and a pattern emerges. Signals ripple `[[forward]]` forward from layer to layer. When the answer is wrong, an `[[error]]` error signal flows backward—and training gently `[[training_alive]]` nudges every weight until the network learns.

3. **`s03_tokens` (35.5 – 53.0 s, 38 words)**
   > Now, how does a network read `[[wipe_tokens]]` language? First, it slices text into bite-sized pieces called `[[tokens]]` tokens. Each token maps to a `[[vectors]]` vector—a list of numbers placing that word in a `[[vectors_alive]]` map of meaning.

4. **`s04_llm` (53.0 – 70.0 s, 41 words)**
   > A large language model reads your prompt and asks one question: `[[llm_box]]` what comes next? It scores every token in its `[[probs]]` vocabulary, picks a likely `[[pick_mat]]` winner, tacks it onto the end, and `[[loop_alive]]` repeats—one word at a time.

5. **`s05_attention` (70.0 – 90.0 s, 44 words)**
   > What makes a transformer smart is `[[wipe_attn]]` self-attention. In "The animal didn't cross the street because `[[sentence]]` it was too tired," attention lets "it" `[[attn_arcs]]` look across the sentence and lock onto `[[attn_alive]]` "animal." Stack dozens of these `[[stack_layers]]` layers, and deep context clicks.

6. **`s06_pipeline` (90.0 – 105.0 s, 32 words)**
   > Put it all together on `[[wipe_wrap]]` one board: `[[pipeline_draw]]` words become tokens, tokens become vectors, attention weighs the context across stacked layers, and `[[cap_on]]` out comes the next `[[pipeline_alive]]` token—prediction by prediction.

---

## Shot List

| Shot | Time (s) | Method | Visuals & Marker Choreography | Living Animation & SFX |
|---|---|---|---|---|
| `s01_neuron` | 0.0 – 17.5 | `blender+code` | Blender hand enters with cap click; marker tip draws input lines `x₁, x₂, x₃`, weight labels `w₁, w₂, w₃`, summation circle `Σ`, activation S-curve `f(x)`, and output arrow. | Input pulses travel wires (`blip`), weights throb, `Σ` flashes cobalt and fires output (`whoosh`). Timed marker squeaks on strokes. |
| `s02_network` | 17.5 – 35.5 | `blender+code` | Board camera pans gently right; hand sketches 3-layer network (`3 → 4 → 2`), target box, and red error return arrow. | Forward cobalt wave ripples through layers; terracotta error pulse returns backward and nudges connection stroke thicknesses (`blip`, `whoosh`). |
| `s03_tokens` | 35.5 – 53.0 | `blender+code` | Blender felt eraser sweeps board clean (`eraser swipe`); hand writes `"The cat sat on the"`, slices into boxed tokens, and draws vector bracket `[0.82, -0.14, 0.51]`. | Token boxes snap and slide into a neat horizontal queue; vector magnitude bars spring up (`whoosh`, `pop`). |
| `s04_llm` | 53.0 – 70.0 | `blender+code` | Hand sketches `LLM` transformer block and probability bars (`mat 72%`, `rug 14%`, `floor 6%`). | Probability bars spring out; `mat` locks in terracotta/cobalt, slides back into the prompt sequence, and triggers the next prediction tick (`whoosh`, `blip`). |
| `s05_attention` | 70.0 – 90.0 | `blender+code` | Eraser sweeps board clean; hand writes `"The animal didn't cross the street because it was too tired"`, circles `it`, draws attention arcs to `animal` & `street`, and sketches `×N` stacked blocks. | Attention arc to `animal` glows thick cobalt while `street` stays faint; signals climb the `×N` layer stack (`whoosh`, harmonic `blip`). |
| `s06_pipeline` | 90.0 – 105.0 | `blender+code` | Quick wipe; hand redraws the full pipeline (`Words → Tokens → Vectors → Attention × N → Next Token`), caps marker (`cap click`) and lifts out of frame. | A clean cobalt pulse travels end-to-end across the entire board; settles into crisp poster frame. |
