// Feature flags read from environment variables.
// Set VITE_PERCENTAGE_ENABLE=true in your .env to show fit-percentage
// badges on job cards and auto-sort results by match score.
export const PERCENTAGE_ENABLE = import.meta.env.VITE_PERCENTAGE_ENABLE === 'true'
