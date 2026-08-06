// Configuración de proveedores de IA soportados para "traer tu propia key"
export const PROVIDERS = {
  claude: {
    id: 'claude',
    label: 'Claude',
    emoji: '🟣',
    model: 'claude-sonnet-4-6',
    placeholder: 'sk-ant-api03-...',
    keyUrl: 'https://console.anthropic.com',
    keyUrlLabel: 'console.anthropic.com',
    desc: 'Llama directo a Anthropic. La key solo vive en tu navegador.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    emoji: '🟢',
    model: 'gpt-4o-mini',
    placeholder: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlLabel: 'platform.openai.com/api-keys',
    desc: 'OpenAI no permite llamadas directas desde el navegador, así que tu key se reenvía a través de nuestro servidor y no se guarda.',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    emoji: '🔵',
    model: 'gemini-flash-latest',
    placeholder: 'AIza...',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyUrlLabel: 'aistudio.google.com/apikey',
    desc: 'Google tampoco permite llamadas directas desde el navegador, así que tu key se reenvía a través de nuestro servidor y no se guarda.',
  },
}

export const PROVIDER_LIST = Object.values(PROVIDERS)
