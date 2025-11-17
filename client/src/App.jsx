import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RollerPage from './components/RollerPage';
import DisplayPage from './components/DisplayPage';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<RollerPage />} />
        <Route path="/display" element={<DisplayPage />} />
      </Routes>
    </Router>
  );
}

export default App;