# Traductor

Traductor web en 33 idiomas (y 5 variantes) que funciona dentro del navegador con el modelo [Hy-MT2 1.8B](https://github.com/Tencent-Hunyuan/Hy-MT2) de Tencent. Sin servidores: el modelo (Q4_K_M, 1,1 GB) se descarga una vez desde Hugging Face, se guarda en el navegador y después traduce sin conexión.

- Motor: [wllama](https://github.com/ngxson/wllama) 3.8.1 (llama.cpp en WebAssembly, con WebGPU cuando está disponible).
- Detección automática del idioma, intercambio, dictado por voz, lectura en voz alta, copiar y compartir, historial local.
- PWA instalable. El service worker añade COOP/COEP para poder usar varios hilos en GitHub Pages.

Atajo: Ctrl + Enter para traducir al momento. También acepta `?q=texto&to=en` en la URL.

## Documentos de Word

En la pestaña **Documentos** puedes traducir un `.docx` entero sin que salga de tu dispositivo. Se conservan el formato (negritas, cursivas, colores, enlaces), los estilos, las listas, las tablas, los encabezados, los pies de página y las imágenes. El archivo traducido se descarga como `nombre (Idioma).docx`.
