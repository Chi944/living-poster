# A minute in the studio

[Watch the 60-second screen recording](assets/living-poster-demo.mp4) · [Open its exported poster](assets/demo-poster.html)

The recording uses an actual local Ollama response through the application's normal API and editor controls. Captions are overlaid for the demonstration. No scene changes or model answers are injected. The capture database and authentication session are temporary and are not included in the repository.

| Time    | On screen                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–4 s   | The Gravity composition in the studio                                                                                                          |
| 4–17 s  | Select its headline and request “Let the Gravity headline float gently.” The real model's validated response applies and highlights the layer. |
| 17–23 s | Play the new motion                                                                                                                            |
| 23–29 s | Pause and move the headline down with the Y control                                                                                            |
| 29–34 s | Undo the manual refinement; retain the animation                                                                                               |
| 34–42 s | Scrub and play the timeline                                                                                                                    |
| 42–55 s | Export the self-contained animated HTML file                                                                                                   |
| 55–60 s | The completed living poster                                                                                                                    |

To reproduce: run `npm run build`, install the Playwright Chromium browser, ensure the configured local Ollama model is available, then run `npx tsx scripts/record-demo.ts`. FFmpeg must be on PATH, or its executable path can be supplied in the `FFMPEG` environment variable. All tools run locally. A busy or cold model can exceed the scheduled clip length; the script stops rather than pretending the response arrived earlier.
