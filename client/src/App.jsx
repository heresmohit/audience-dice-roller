import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RollerPage from './components/RollerPage';
import DisplayPage from './components/DisplayPage';
import HostPage from './components/HostPage';

import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<RollerPage />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="/host" element={<HostPage />} />
      </Routes>
    </Router>
  );
}

export default App;