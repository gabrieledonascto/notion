export default {
  // Página raiz pública do Notion (https://planet-packet-062.notion.site/Central-de-Conhecimento-3e6b8541e0fe80da872af510a9c9167a)
  rootPageId: '3e6b8541e0fe80da872af510a9c9167a',
  siteName: 'Central de Conhecimento',
  description: 'Base de conhecimento com processos, fluxos, erros mapeados e boas práticas.',

  chat: {
    // Webhook do nó "Chat Trigger" do n8n
    webhookUrl: 'https://n8n-n8n.tj0kz7.easypanel.host/webhook/08b9d279-e313-440c-b03e-2a9bc1f49709/chat',
    title: 'Tiger IA',
    subtitle: 'Assistente da Central Tigers',
    // Emoji ou caminho de imagem (ex.: './assets/tiger.png' — coloque o arquivo em static/)
    avatar: '🐯',
    welcome: 'Olá! 👋 Sou o Tiger IA, seu assistente da Central de Conhecimento. Como posso ajudar?',
    suggestionsTitle: 'Explore com o Tiger',
    suggestions: [
      'Como criar uma automação?',
      'Como configurar um pipeline?',
      'Como resolver erros de conexão?',
    ],
    placeholder: 'Pergunte ao Tiger IA...',
    disclaimer: 'Tiger IA pode cometer erros. Confira as fontes.',
    errorMessage: 'Não consegui responder agora. Tente novamente em instantes.',
  },
}
