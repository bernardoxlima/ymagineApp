/**
 * Site metadata configuration - SIMPLE AND WORKING
 */

const baseUrl = process.env.KORTIX_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'https://ymagine.app';

export const siteMetadata = {
  name: 'Ymagine',
  title: 'Ymagine – AI Agent Platform',
  description:
    'A cloud computer where AI agents run your business. Connect thousands of tools, configure autonomous agents, set triggers — and the machine operates 24/7 with persistent memory.',
  url: baseUrl,
  keywords:
    'Ymagine, AI agents, autonomous agents, AI automation, agent orchestration, cloud computer, persistent memory, AI operations',
};
