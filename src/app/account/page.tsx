import type { Metadata } from 'next';
import AccountSettings from './AccountSettings';
import './account.css';

export const metadata: Metadata = { title: 'Account' };

export default function AccountPage() {
  return <AccountSettings />;
}
