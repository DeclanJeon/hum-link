import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Redirect to Landing page for clean URL structure
const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  return null;
};

export default Index;
