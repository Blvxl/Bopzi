import type { Metadata } from 'next';
import AccountSettings from './AccountSettings';
import './account.css';

export const metadata: Metadata = { title: 'Account', robots: { index: false, follow: false } };

export default function AccountPage() {
  return <AccountSettings />;
}
