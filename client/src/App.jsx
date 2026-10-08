import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import TopBar from './components/TopBar.jsx';
import UserDialog from './components/UserDialog.jsx';
import { useUser } from './user.js';
import Projects from './pages/Projects.jsx';
import ProjectLayout from './pages/ProjectLayout.jsx';
import Overview from './pages/Overview.jsx';
import ProjectSettings from './pages/ProjectSettings.jsx';
import ReposHome from './pages/repos/ReposHome.jsx';
import RepoLayout from './pages/repos/RepoLayout.jsx';
import Files from './pages/repos/Files.jsx';
import EditFile from './pages/repos/EditFile.jsx';
import Commits from './pages/repos/Commits.jsx';
import CommitDetail from './pages/repos/CommitDetail.jsx';
import Branches from './pages/repos/Branches.jsx';
import PullRequests from './pages/repos/PullRequests.jsx';
import NewPullRequest from './pages/repos/NewPullRequest.jsx';
import PullRequestDetail from './pages/repos/PullRequestDetail.jsx';
import BoardsLayout from './pages/boards/BoardsLayout.jsx';
import Backlog from './pages/boards/Backlog.jsx';
import Board from './pages/boards/Board.jsx';
import IssueList from './pages/boards/IssueList.jsx';
import BoardSettings from './pages/boards/BoardSettings.jsx';
import WikiLayout from './pages/wiki/WikiLayout.jsx';
import WikiHome from './pages/wiki/WikiHome.jsx';
import PageView from './pages/wiki/PageView.jsx';
import PageEdit from './pages/wiki/PageEdit.jsx';
import PageHistory from './pages/wiki/PageHistory.jsx';

export default function App() {
  const user = useUser();
  const [editingUser, setEditingUser] = useState(false);
  return (
    <div className="app">
      <TopBar onEditUser={() => setEditingUser(true)} />
      {(!user.name || editingUser) && <UserDialog onClose={user.name ? () => setEditingUser(false) : null} />}
      <Routes>
        <Route path="/" element={<Projects />} />
        <Route path="/:key" element={<ProjectLayout />}>
          <Route index element={<Overview />} />
          <Route path="settings" element={<ProjectSettings />} />
          <Route path="boards" element={<BoardsLayout />}>
            <Route index element={<Navigate to="board" replace />} />
            <Route path="board" element={<Board />} />
            <Route path="backlog" element={<Backlog />} />
            <Route path="issues" element={<IssueList />} />
            <Route path="settings" element={<BoardSettings />} />
          </Route>
          <Route path="repos" element={<ReposHome />} />
          <Route path="repos/:repo" element={<RepoLayout />}>
            <Route index element={<Navigate to="files" replace />} />
            <Route path="files" element={<Files />} />
            <Route path="edit" element={<EditFile />} />
            <Route path="commits" element={<Commits />} />
            <Route path="commit/:sha" element={<CommitDetail />} />
            <Route path="branches" element={<Branches />} />
            <Route path="pulls" element={<PullRequests />} />
            <Route path="pulls/new" element={<NewPullRequest />} />
            <Route path="pulls/:id" element={<PullRequestDetail />} />
          </Route>
          <Route path="wiki" element={<WikiLayout />}>
            <Route index element={<WikiHome />} />
            <Route path=":pageId" element={<PageView />} />
            <Route path=":pageId/edit" element={<PageEdit />} />
            <Route path=":pageId/history" element={<PageHistory />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
