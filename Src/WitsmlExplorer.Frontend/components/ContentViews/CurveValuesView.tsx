import React, { useContext, useEffect, useState } from "react";
import styled from "styled-components";
import LogObjectService from "../../services/logObjectService";
import { truncateAbortHandler } from "../../services/apiClient";
import NavigationContext from "../../contexts/navigationContext";
import { CurveSpecification, LogData, LogDataRow } from "../../models/logData";
import { ContentTableColumn, ContentType, VirtualizedContentTable, ContentTableRow } from "./table";
import { WITSML_INDEX_TYPE_DATE_TIME } from "../Constants";
import { LinearProgress } from "@material-ui/core";

interface CurveValueRow extends LogDataRow, ContentTableRow {}

export const CurveValuesView = (): React.ReactElement => {
  const { navigationState } = useContext(NavigationContext);
  const { selectedWell, selectedWellbore, selectedLog, selectedLogCurveInfo } = navigationState;
  const [columns, setColumns] = useState<ContentTableColumn[]>([]);
  const [tableData, setTableData] = useState<CurveValueRow[]>();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    setTableData([]);
    setIsLoading(true);
    const controller = new AbortController();

    function isNewMnemonic(mnemonic: string) {
      return columns.map((column) => column.property).indexOf(mnemonic) < 0;
    }

    function getColumnType(curveSpecification: CurveSpecification) {
      const isTimeMnemonic = (mnemonic: string) => ["time", "datetime", "date time"].indexOf(mnemonic.toLowerCase()) >= 0;
      if (isTimeMnemonic(curveSpecification.mnemonic)) {
        return ContentType.DateTime;
      }
      switch (curveSpecification.unit.toLowerCase()) {
        case "time":
        case "datetime":
          return ContentType.DateTime;
        case "unitless":
          return ContentType.String;
        default:
          return ContentType.Number;
      }
    }

    function updateColumns(curveSpecifications: CurveSpecification[]) {
      const newColumns = curveSpecifications
        .filter((curveSpecification) => isNewMnemonic(curveSpecification.mnemonic))
        .map((curveSpecification) => {
          return {
            property: curveSpecification.mnemonic,
            label: `${curveSpecification.mnemonic} (${curveSpecification.unit})`,
            type: getColumnType(curveSpecification)
          };
        });
      setColumns([...columns, ...newColumns]);
    }

    function getProgressRange(startIndex: string, endIndex: string) {
      return selectedLog.indexType === WITSML_INDEX_TYPE_DATE_TIME
        ? {
            minIndex: new Date(startIndex).getTime(),
            maxIndex: new Date(endIndex).getTime()
          }
        : {
            minIndex: Number(startIndex),
            maxIndex: Number(endIndex)
          };
    }

    function updateProgress(index: string, minIndex: number, maxIndex: number) {
      const normalize = (value: number) => ((value - minIndex) * 100) / (maxIndex - minIndex);
      if (selectedLog.indexType === WITSML_INDEX_TYPE_DATE_TIME) {
        setProgress(normalize(new Date(index).getTime()));
      } else {
        setProgress(normalize(Number(index)));
      }
    }

    async function getLogData() {
      const mnemonics = selectedLogCurveInfo.map((lci) => lci.mnemonic);
      let startIndex = String(selectedLogCurveInfo[0].minIndex);
      const endIndex = String(selectedLogCurveInfo[0].maxIndex);
      const { minIndex, maxIndex } = getProgressRange(startIndex, endIndex);

      let completeData: CurveValueRow[] = [];
      let fetchData = true;
      while (fetchData) {
        const logData: LogData = await LogObjectService.getLogData(
          selectedWell.uid,
          selectedWellbore.uid,
          selectedLog.uid,
          mnemonics,
          completeData.length === 0,
          startIndex,
          endIndex,
          controller.signal
        );
        if (logData.data) {
          updateProgress(logData.endIndex, minIndex, maxIndex);
          updateColumns(logData.curveSpecifications);

          const logDataRows = logData.data.map((data, index) => {
            const row: CurveValueRow = {
              id: completeData.length + index,
              ...data
            };
            return row;
          });
          completeData = [...completeData, ...logDataRows];
          setTableData(completeData);
          startIndex = logData.endIndex;
        } else {
          fetchData = false;
        }
      }
    }

    if (selectedLogCurveInfo) {
      getLogData()
        .catch(truncateAbortHandler)
        .then(() => setIsLoading(false));
    }

    return () => {
      controller.abort();
    };
  }, [selectedLogCurveInfo, selectedLog]);

  return (
    <Container>
      {isLoading && <LinearProgress variant={"determinate"} value={progress} />}
      {!isLoading && !tableData && <Message>No data</Message>}
      {columns && tableData?.length > 0 && <VirtualizedContentTable columns={columns} data={tableData} checkableRows={true} />}
    </Container>
  );
};

const Container = styled.div`
  height: calc(100% - 5px);
  width: 100%;
`;

const Message = styled.div`
  margin: 10px;
  padding: 10px;
`;
