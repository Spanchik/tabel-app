import { ReactNode } from "react";
import { NavLink } from "react-router-dom";

type AppLayoutProps = {
  children: ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="page-container">
      <header className="app-header">
        <div className="app-title">
          <span className="app-title-main">Табель S.V. Group</span>
          <span className="app-title-sub">управління змінами та підмінами</span>
          <span className="app-badge">beta</span>
        </div>

        <nav className="app-nav">
          <NavLink
            to="/"
            className={({ isActive }) =>
              "app-nav-link" + (isActive ? " app-nav-link-active" : "")
            }
            end
          >
            Округа
          </NavLink>

          <NavLink
            to="/stores"
            className={({ isActive }) =>
              "app-nav-link" + (isActive ? " app-nav-link-active" : "")
            }
          >
            ТТ
          </NavLink>

          <NavLink
            to="/staff"
            className={({ isActive }) =>
              "app-nav-link" + (isActive ? " app-nav-link-active" : "")
            }
          >
            Персонал
          </NavLink>
        </nav>
      </header>

      {children}
    </div>
  );
}
