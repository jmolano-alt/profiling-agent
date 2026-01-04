# Imagen oficial con browsers y dependencias ya listas
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Instala dependencias Node
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copia el código
COPY . .

ENV NODE_ENV=production
# Render suele inyectar PORT; esto es fallback
ENV PORT=10000

CMD ["node", "server.js"]
