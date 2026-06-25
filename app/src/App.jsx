import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import StartWorkflowPage from "./pages/StartWorkflowPage";
import HumanTasksPage from "./pages/HumanTasksPage";
import HumanTaskSearchPage from "./pages/HumanTaskSearchPage";
import AdminWorkflowsPage from "./pages/AdminWorkflowsPage";
import MyWorkflowsPage from "./pages/MyWorkflowsPage";
import WorkflowDetailPage from "./pages/WorkflowDetailPage";
import { getSelectedUser } from "./api/managementApi";
import "./App.css";

// Shop initiates adoptions → land on Start. Shelter monitors/approves → land on tasks.
function HomeRedirect() {
  const persona = getSelectedUser().persona;
  return <Navigate to={persona === 'Shop' ? '/start' : '/tasks'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/start" element={<StartWorkflowPage />} />
          <Route path="/workflows" element={<MyWorkflowsPage />} />
          <Route path="/workflows/:workflowId/:runId" element={<WorkflowDetailPage />} />
          <Route path="/admin/workflows" element={<AdminWorkflowsPage />} />
          <Route path="/tasks"           element={<HumanTasksPage key="all"       defaultTab="All" />} />
          <Route path="/tasks/pending"   element={<HumanTasksPage key="pending"   defaultTab="Pending" />} />
          <Route path="/tasks/completed" element={<HumanTasksPage key="completed" defaultTab="Completed" />} />
          <Route path="/tasks/search"    element={<HumanTaskSearchPage />} />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
