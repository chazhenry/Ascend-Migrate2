/*
================================================================================
CCH Jobs Export Script
Builds AA_CCH_Jobs staging and CCH_Jobs_Export for CCH import.

Note: CCH does not use the same concept of Job Period Start/End as Practice
Engine. PE job info is held in tblJob_Header (bulk) and tblJob_TaxReturn
(tax job due dates), which we coalesce to derive the CCH Due Date.
================================================================================
*/

SET NOCOUNT ON;

-- Clean up prior runs
DROP TABLE IF EXISTS AA_CCH_Jobs;
DROP TABLE IF EXISTS CCH_Jobs_Export;

GO

/*
--------------------------------------------------------------------------------
STEP 1: Build AA_CCH_Jobs staging table
--------------------------------------------------------------------------------
*/

SELECT
    E.ClientCode                                                            AS [Cltnum],
    0                                                                       AS [Engagement],
    S.ServTitle                                                             AS [Project Type],
    COALESCE(T.CurrentDueDate, J.Job_Period_End)                            AS [Due Date],
    NULL                                                                    AS [Start Date],
    NULL                                                                    AS [Target Date],
    NULL                                                                    AS [TargetHours],
    NULL                                                                    AS [TargetAmount],
    NULL                                                                    AS [DateCompleted1],
    NULL                                                                    AS [DateCompleted2],
    NULL                                                                    AS [DateReceived],
    NULL                                                                    AS [DateCompleted],
    NULL                                                                    AS [DateDelivered],
    CASE J.Job_Status
        WHEN 0 THEN 'Not Started'
        WHEN 1 THEN 'In-Progress'
        WHEN 2 THEN 'Complete'
        WHEN 3 THEN 'Closed'
        ELSE        'Not Started'
    END                                                                     AS [Status],
    J.Job_Name                                                              AS [Description],
    NULL                                                                    AS [Prompt for Time Entry],
    NULL                                                                    AS [CDOneYear],
    NULL                                                                    AS [InCharge Person (NOT Preparer or Reviewer)],
    NULL                                                                    AS [CDNote],
    NULL                                                                    AS [Event SCCat],
    NULL                                                                    AS [Event SCSub],
    NULL                                                                    AS [BillRate],
    J.Job_Idx                                                               AS [PEIndex]
INTO AA_CCH_Jobs
FROM tblJob_Header J
INNER JOIN tblEngagement   E  ON E.ContIndex  = J.ContIndex
INNER JOIN tblJob_Serv     JS ON JS.Job_Idx   = J.Job_Idx
INNER JOIN tblServices     S  ON S.ServIndex  = JS.ServIndex
LEFT  JOIN tblJob_TaxReturn T  ON T.Job_Idx   = J.Job_Idx
WHERE E.ContIndex < 900000;

/*
--------------------------------------------------------------------------------
STEP 2: Build CCH_Jobs_Export (final import table)
--------------------------------------------------------------------------------
*/

SELECT *
INTO CCH_Jobs_Export
FROM AA_CCH_Jobs
ORDER BY [Cltnum], [Project Type];

/*
--------------------------------------------------------------------------------
STEP 3: Final Output
--------------------------------------------------------------------------------
*/

SELECT *
FROM CCH_Jobs_Export
ORDER BY [Cltnum], [Project Type];

GO
