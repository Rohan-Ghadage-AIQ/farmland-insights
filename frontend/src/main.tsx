import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { AppProviders } from '@/app/providers';
import { InspectorSlot, MapSlot, SetupSlot, WorkspaceProvider } from '@/app/workspace';
import { LoginCard, UserMenu } from '@/features/auth';
import { createLocalSessionStore } from '@/features/saved-locations';
// Importing env here validates the configuration before anything renders (fails loudly).
import '@/lib/env';
import '@/styles/globals.css';

// Remembers the field and settings between visits (see WorkspaceProvider).
const sessionStore = createLocalSessionStore();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root element in index.html');
}

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <WorkspaceProvider sessionStore={sessionStore}>
        <App
          slots={{
            login: <LoginCard />,
            user: <UserMenu />,
            setup: <SetupSlot />,
            map: <MapSlot />,
            inspector: <InspectorSlot />,
          }}
        />
      </WorkspaceProvider>
    </AppProviders>
  </StrictMode>,
);
