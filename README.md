# Traductor

Traductor web en 33 idiomas (y 5 variantes) que funciona dentro del navegador con el modelo [Hy-MT2 1.8B](https://github.com/Tencent-Hunyuan/Hy-MT2) de Tencent. Sin servidores: el modelo (Q4_K_M, 1,1 GB) se descarga una vez desde Hugging Face, se guarda en el navegador y después traduce sin conexión.

- Motor: [wllama](https://github.com/ngxson/wllama) 3.8.1 (llama.cpp en WebAssembly, con WebGPU cuando está disponible).
- Detección automática del idioma, intercambio, dictado por voz, lectura en voz alta, copiar y compartir, historial local.
- PWA instalable. El service worker añade COOP/COEP para poder usar varios hilos en GitHub Pages.

Atajo: Ctrl + Enter para traducir al momento. También acepta `?q=texto&to=en` en la URL.

## Documentos

En la pestaña **Documentos** traduces un archivo entero sin que salga de tu dispositivo:

- **Word (.docx)**: formato, estilos, listas, tablas, encabezados, pies de página e imágenes.
- **PowerPoint (.pptx)**: diapositivas, notas del orador, SmartArt y gráficos, con su formato.
- **Excel (.xlsx)**: textos de las celdas (incluido texto enriquecido); números, fórmulas, correos y enlaces no se tocan.
- **Markdown (.md)**: encabezados, listas, tablas, enlaces y negritas; el código y las URLs se protegen.
- **Texto y subtítulos (.txt, .srt, .vtt)**: línea a línea; los tiempos de los subtítulos se conservan.

El archivo traducido se descarga como `nombre (Idioma).ext`.
