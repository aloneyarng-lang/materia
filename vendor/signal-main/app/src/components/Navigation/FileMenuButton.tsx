import { useTheme } from "@emotion/react"
import { Menu, MenuDivider, MenuItem, SubMenu } from "@signal-app/ui"
import ChevronRight from "mdi-react/ChevronRightIcon"
import KeyboardArrowDown from "mdi-react/KeyboardArrowDownIcon"
import { type FC, useCallback, useState } from "react"
import { hasFSAccess } from "../../actions/file"
import { useExport } from "../../features/export/hooks/useExport"
import { Localized } from "../../localize/useLocalization"
import { FileMenu } from "./FileMenu"
import { LegacyFileMenu } from "./LegacyFileMenu"
import { Tab } from "./Navigation"

export const FileMenuButton: FC = () => {
  const { exportSong } = useExport()
  const theme = useTheme()
  const [isOpen, setOpen] = useState(false)

  const onClickExportWav = useCallback(() => {
    exportSong("WAV")
  }, [exportSong])

  const onClickExportMp3 = useCallback(() => {
    exportSong("MP3")
  }, [exportSong])

  return (
    <Menu
      open={isOpen}
      onOpenChange={setOpen}
      trigger={
        <Tab id="tab-file">
          <span style={{ marginLeft: "0.25rem" }}>
            <Localized name="file" />
          </span>
          <KeyboardArrowDown style={{ width: "1rem", marginLeft: "0.25rem" }} />
        </Tab>
      }
    >
      {hasFSAccess ? <FileMenu /> : <LegacyFileMenu />}

      <MenuDivider />

      <SubMenu
        trigger={
          <MenuItem>
            <Localized name="export" />
            <ChevronRight
              style={{ marginLeft: "auto", fill: theme.tertiaryTextColor }}
            />
          </MenuItem>
        }
      >
        <MenuItem onClick={onClickExportWav}>WAV</MenuItem>
        <MenuItem onClick={onClickExportMp3}>MP3</MenuItem>
      </SubMenu>
    </Menu>
  )
}
