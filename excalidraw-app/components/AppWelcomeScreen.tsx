import { loginIcon } from "@excalidraw/excalidraw/components/icons";
import { POINTER_EVENTS } from "@excalidraw/common";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { WelcomeScreen } from "@excalidraw/excalidraw/index";
import React from "react";

import { isExcalidrawPlusSignedUser } from "../app_constants";

export const AppWelcomeScreen: React.FC<{
  onCollabDialogOpen: () => any;
  isCollabEnabled: boolean;
}> = React.memo((props) => {
  const { t } = useI18n();
  let headingContent;

  if (isExcalidrawPlusSignedUser) {
    headingContent = t("welcomeScreen.app.center_heading_plus")
      .split(/(BraisedEgg)/)
      .map((bit, idx) => {
        if (bit === "BraisedEgg") {
          return (
            <a
              style={{ pointerEvents: POINTER_EVENTS.inheritFromUI }}
              href="https://braisedegg.com"
              key={idx}
            >
              BraisedEgg
            </a>
          );
        }
        return bit;
      });
  } else {
    headingContent = (
      <>
        Sketch, diagram, and brainstorm with a hand-drawn feel — your ideas
        stay right here in your browser until you save them.
        <br />
        <span
          style={{
            display: "inline-block",
            marginTop: "0.75rem",
            fontSize: "0.8rem",
            opacity: 0.55,
          }}
        >
          Modified from Excalidraw
        </span>
      </>
    );
  }

  return (
    <WelcomeScreen>
      <WelcomeScreen.Hints.MenuHint>
        {t("welcomeScreen.app.menuHint")}
      </WelcomeScreen.Hints.MenuHint>
      <WelcomeScreen.Hints.ToolbarHint />
      <WelcomeScreen.Hints.HelpHint />
      <WelcomeScreen.Center>
        <WelcomeScreen.Center.Logo>
          <span
            style={{
              background: "linear-gradient(90deg, #fbbf24 0%, #e07b1e 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "#e07b1e",
              display: "inline-block",
              fontWeight: 700,
            }}
          >
            Drawthing by BraisedEgg
          </span>
        </WelcomeScreen.Center.Logo>
        <WelcomeScreen.Center.Heading>
          {headingContent}
        </WelcomeScreen.Center.Heading>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItemLoadScene />
          <WelcomeScreen.Center.MenuItemHelp />
          {props.isCollabEnabled && (
            <WelcomeScreen.Center.MenuItemLiveCollaborationTrigger
              onSelect={() => props.onCollabDialogOpen()}
            />
          )}
          <WelcomeScreen.Center.MenuItemLink
            href="https://braisedegg.com"
            shortcut={null}
            icon={loginIcon}
          >
            Discover our other projects
          </WelcomeScreen.Center.MenuItemLink>
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  );
});
