export default {
  // Página raiz pública do Notion (https://planet-packet-062.notion.site/Central-de-Conhecimento-3e6b8541e0fe80da872af510a9c9167a)
  rootPageId: '3e6b8541e0fe80da872af510a9c9167a',
  siteName: 'Central de Conhecimento',
  description: 'Base de conhecimento com processos, fluxos, erros mapeados e boas práticas.',

  chat: {
    // Webhook do nó "Chat Trigger" do n8n
    webhookUrl: 'https://n8n-n8n.tj0kz7.easypanel.host/webhook/08b9d279-e313-440c-b03e-2a9bc1f49709/chat',
    version: '1.42.5', // versão do pacote @n8n/chat
    primaryColor: '#2383e2',
    initialMessages: ['Olá! 👋', 'Sou o assistente da Central de Conhecimento. Como posso ajudar?'],
    i18n: {
      title: 'Assistente',
      subtitle: 'Tire suas dúvidas sobre a Central de Conhecimento.',
      footer: '',
      getStarted: 'Nova conversa',
      inputPlaceholder: 'Digite sua pergunta...',
      closeButtonTooltip: 'Fechar',
    },
  },
}
