# Traductor

Traductor web en 33 idiomas (y 5 variantes) que funciona dentro del navegador con el modelo [Hy-MT2 1.8B](https://github.com/Tencent-Hunyuan/Hy-MT2) de Tencent. Sin servidores: el modelo (Q4_K_M, 1,1 GB) se descarga una vez desde Hugging Face, se guarda en el navegador y después traduce sin conexión.

- Motor: [wllama](https://github.com/ngxson/wllama) 3.8.1 (llama.cpp en WebAssembly, con WebGPU cuando está disponible).
- Detección automática del idioma, intercambio, dictado por voz, lectura en voz alta, copiar y compartir, historial local.
- PWA instalable. El service worker añade COOP/COEP para poder usar varios hilos en GitHub Pages.

Atajo: Ctrl + Enter para traducir al momento. También acepta `?q=texto&to=en` en la URL.

## Cámara

En la pestaña **Cámara** haces una foto (o subes una imagen) a un cartel, una carta o un menú: la app lee el texto con Tesseract.js, lo traduce y lo pinta encima de la foto con los colores del original. Puedes ver la traducción o el original, guardar la imagen o copiar el texto. La primera vez se descarga el lector del idioma de la foto (unos MB).

## Documentos

En la pestaña **Documentos** traduces un archivo entero sin que salga de tu dispositivo:

- **PDF**: se mantiene el diseño de cada página (columnas, colores, imágenes); el texto traducido se ajusta al hueco del original. Los PDF escaneados sin texto no se pueden traducir, y de momento no escribe árabe, hebreo, persa, urdu, idiomas de la India, tailandés, jemer, birmano, tibetano ni uigur.
- **Word (.docx)**: formato, estilos, listas, tablas, encabezados, pies de página e imágenes.
- **PowerPoint (.pptx)**: diapositivas, notas del orador, SmartArt y gráficos, con su formato.
- **Excel (.xlsx)**: textos de las celdas (incluido texto enriquecido); números, fórmulas, correos y enlaces no se tocan.
- **Markdown (.md)**: encabezados, listas, tablas, enlaces y negritas; el código y las URLs se protegen.
- **Texto y subtítulos (.txt, .srt, .vtt)**: línea a línea; los tiempos de los subtítulos se conservan.

El archivo traducido se descarga como `nombre (Idioma).ext`.
