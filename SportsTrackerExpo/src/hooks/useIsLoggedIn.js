import { useEffect, useState } from "react";
import { supabase } from "../config/supabase";

const useIsLoggedIn = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) setIsLoggedIn(!!data?.session);
      } catch {
        if (mounted) setIsLoggedIn(false);
      }
    };

    syncSession();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setIsLoggedIn(!!session);
    });

    return () => {
      mounted = false;
      if (data?.subscription) data.subscription.unsubscribe();
    };
  }, []);

  return isLoggedIn;
};

export default useIsLoggedIn;
