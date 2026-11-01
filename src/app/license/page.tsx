import Link from 'next/link';
import type { Metadata } from 'next';
import '../about/privacy.css';

export const metadata: Metadata = { title: 'Licensing' };

export default function License() {
  return <main className="about-page"><Link href="/" className="about-back">← Back to Bopzi</Link><h1>Licensing</h1><p>The current version of Bopzi is proprietary and is not offered under an open-source license.</p><p>Earlier copies published under the MIT License remain subject to the terms that accompanied those copies. This notice does not revoke rights already granted. Third-party dependencies and assets may have their own licenses.</p></main>;
}
