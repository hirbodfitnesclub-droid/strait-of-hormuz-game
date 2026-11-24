'use client';
import "../globals.css";
import "../mobile-game.css";
import "../workshop.css";
import "../workshop-command.css";
import "../workshop-progress.css";
import "../workshop-panels.css";
import "../workshop-build.css";
import dynamic from 'next/dynamic';

const ThreeMap = dynamic(() => import('../../components/ThreeMap'), { ssr: false });

export default function Map3dPreview() {
  return (
    <main style={{ position: 'fixed', inset: 0, background: '#04121f' }}>
      <ThreeMap demo />
    </main>
  );
}
