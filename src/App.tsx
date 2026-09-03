import { Toaster } from "react-hot-toast";
import { ProjectProvider, useProject } from "./state/ProjectContext";
import Landing from "./components/landing/Landing";
import Workspace from "./components/workspace/Workspace";

function Root() {
  const { state } = useProject();
  return (
    <>
      {state.route === "landing" ? <Landing /> : <Workspace />}
      <Toaster position="top-center" toastOptions={{ style: { fontSize: "13px" } }} />
    </>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <Root />
    </ProjectProvider>
  );
}
