import type { Metadata } from 'next';
import AboutPageClient from './about-client';

export const metadata: Metadata = {
  title: 'About',
  description:
    'We build self-driving companies. 76% agents, 24% humans — where humans verify, steer, and govern. Agents do the work. Full agent teams doing engineering, product, operations, finance, support, and growth.',
  keywords:
    'Ymagine, about Ymagine, self-driving company, AI-operated company, autonomous operations, agent workforce, AI agents, company automation',
  openGraph: {
    title: 'About Ymagine',
    description:
      'We take process-heavy companies and turn them into AI-operated ones. Full agent teams doing engineering, product, operations, finance, support, and growth.',
    url: 'https://ymagine.app/about',
    images: [
      {
        url: '/images/team.webp',
        width: 1200,
        height: 675,
        alt: 'The Ymagine team',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Ymagine',
    description:
      'We take process-heavy companies and turn them into AI-operated ones. Full agent teams doing engineering, product, operations, finance, support, and growth.',
    images: ['/images/team.webp'],
  },
  alternates: {
    canonical: 'https://ymagine.app/about',
  },
};

export default function AboutPage() {
  return <AboutPageClient />;
}
