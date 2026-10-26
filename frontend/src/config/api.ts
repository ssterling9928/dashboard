// Base URL for backend requests.
// Unset in the Docker image: the backend serves the frontend, so "/api/..."
// on the same origin is right. Set VITE_API_URL=/proxy/4000 in .env when
// developing behind the code-server proxy.
export const API = import.meta.env.VITE_API_URL ?? ''
