import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Login from './login.jsx'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SignupAgree from "./signupAgree.jsx";
import Signup from "./signup.jsx";
import Dashboard from "./dashboard.jsx";
import DashboardSummary from "./dashboardSummary.jsx";
import Mypage from "./mypage";
import Contact from "./contact.jsx";

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup-agree" element={<SignupAgree />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/dashboardSummary" element={<DashboardSummary />} />
      <Route path="/mypage" element={<Mypage />} />
      <Route path="/contact" element={<Contact />} />
    </Routes>
  </BrowserRouter>
) 
