# BananoCheck (full stack)
Backend Node/Express + MongoDB (NoSQL) + Socket.IO (tiempo real) + JWT. Frontend en public/index.html con TensorFlow.js.

## Ejecutar
1. Tu modelo se carga desde el enlace de Teachable Machine (MODEL_URL en public/index.html). Alternativa sin internet: copia model.json, model.weights.bin y metadata.json a `public/model/`.
2. `docker compose up -d`  (MongoDB; o usa tu propio Mongo / MongoDB Atlas y cambia MONGO_URL)
3. `cp .env.example .env` y cambia JWT_SECRET
4. `npm install && npm start`
5. Abre http://localhost:3000  -> "Crear cuenta" y luego evalua.

Para el celular y su camara necesitas HTTPS: despliega en Render/Railway/Fly con MongoDB Atlas, o usa un tunel (ngrok).
