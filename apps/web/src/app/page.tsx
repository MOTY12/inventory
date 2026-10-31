import { WorkspaceShell } from "../components/workspace-shell";
import { ProtectedContent } from "../features/auth/session-provider";

export default function HomePage() {
  return (
    <ProtectedContent>
      <WorkspaceShell />
    </ProtectedContent>
  );
}
