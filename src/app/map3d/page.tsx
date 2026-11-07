'use client';
import dynamic from 'next/dynamic';

const ThreeMap = dynamic(() => import('../../components/ThreeMap'), { ssr: false });

export default function Map3dPreview() {
  return (
    <main style={{ position: 'fixed', inset: 0, background: '#04121f' }}>
      <ThreeMap demo />
    </main>
  );
}
