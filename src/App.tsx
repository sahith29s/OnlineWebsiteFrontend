import { Route, Routes } from "react-router-dom";
import Contact from "./components/pages/Contact";
import Navbar from "./components/justComponents/Navbar";
import Homepage from "./components/pages/Homepage";
import Footer from "./components/justComponents/Footer";
import AboutUs from "./components/pages/About";
import Chat from "./components/pages/Chat/Chat";
import Pagenotfound from "./components/pages/Pagenotfound";
import Signup from "./components/auth/Signup";
import Login from "./components/auth/Login";
import TicTacToe from "./components/pages/TicTacToe/TicTacToe";
import AmazonCloHomepage from "./components/pages/AmazonClone/AmazonCloHomepage";
import Calculator from "./components/pages/Calculator/Calculator";
import Aqi from "./components/pages/Aqi";

const App = () => {
  return (
    <>
      {/* <div className="bg-red-700 flex items-center text-center text-white font-xl h-9 justify-center">
        Website under construction
      </div> */}

      {/* <Navbar /> */}
      <Routes>
        <Route path="/contact" element={<Contact />} />
        {/* <Route path="/" element={<Homepage />} /> */}
        <Route path="/" element={<Aqi/>} />
        <Route path="*" element={<Pagenotfound />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/tictactoe" element={<TicTacToe />} />
        <Route path="/amazonclone" element={<AmazonCloHomepage />} />
        <Route path="/calculator" element={<Calculator />} />
      </Routes>

      {/* <Footer /> */}
    </>
  );
};

export default App;
