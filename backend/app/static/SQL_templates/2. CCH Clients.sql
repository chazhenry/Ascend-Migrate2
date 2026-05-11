/*
================================================================================
CCH Clients Export Script
Builds AA_CCH_Clients staging and CCH_Clients_Export for CCH import.
Uses the AP contact on the engagement for address/phone/email fields.
================================================================================
*/

SET NOCOUNT ON;

-- Clean up prior runs
DROP TABLE IF EXISTS AA_CCH_Clients;
DROP TABLE IF EXISTS CCH_Clients_Export;

GO

/*
--------------------------------------------------------------------------------
STEP 1: Build AA_CCH_Clients staging table
--------------------------------------------------------------------------------
*/

SELECT
    E.ClientOffice                                                          AS [Office],
    E.ClientCode                                                            AS [Cltnum],
    0                                                                       AS [Engagement],
    E.ClientName                                                            AS [Cltname],
    E.ClientShortCode                                                       AS [Engdesc],

    -- Client address
    C.ContAddress                                                           AS [Client Addr1],
    NULL                                                                    AS [Client Addr2],
    NULL                                                                    AS [Client Addr3],
    C.ContTownCity                                                          AS [Client City],
    C.ContCounty                                                            AS [Client State/Provence],
    C.ContPostCode                                                          AS [Client Zip/Postal Code],
    C.ContCountry                                                           AS [Client Country],

    -- Classification
    O.OwnerName                                                             AS [Entity],
    SS.SICDesc                                                              AS [SICCODE],
    I.CatName                                                               AS [Industry],
    NULL                                                                    AS [Work Type],
    NULL                                                                    AS [Group Field],
    CASE E.ClientStatus
        WHEN 'ACTIVE'    THEN 'Active'
        WHEN 'SUSPENDED' THEN 'Hold'
        WHEN 'LOST'      THEN 'Inactive'
        ELSE                  'Active'
    END                                                                     AS [Status],
    NULL                                                                    AS [FYE],
    E.ClientVATNumber                                                       AS [Fedid],
    NULL                                                                    AS [SSN1],
    NULL                                                                    AS [SSN2],
    D.DeptName                                                              AS [Dept],
    NULL                                                                    AS [Line of Business],
    NULL                                                                    AS [Language],
    NULL                                                                    AS [Attn],
    NULL                                                                    AS [Salutation],

    -- Billing address
    NULL                                                                    AS [Billing Name],
    NULL                                                                    AS [Billing Addr1],
    NULL                                                                    AS [Billing Addr2],
    NULL                                                                    AS [Billing Addr3],
    NULL                                                                    AS [Billing City],
    NULL                                                                    AS [Billing State/Provence],
    NULL                                                                    AS [Billing Zip/Postal Code],
    NULL                                                                    AS [Billing Country],

    -- Flags and dates
    'Y'                                                                     AS [Billable (Y/N)],
    CASE E.ClientWIPList WHEN 0 THEN 'N' ELSE 'Y' END                       AS [Finance Charge],
    CAST(E.ClientCreated AS DATE)                                           AS [Active date],
    CASE WHEN E.ClientStatus = 'LOST'
         THEN COALESCE(G.GainLossDate, E.ClientUpdated)
         ELSE NULL
    END                                                                     AS [Inactive date],

    -- Contact info (from primary contact record)
    C.ContPhone                                                             AS [Phone 1],
    C.ContMobile                                                            AS [Phone 2],
    NULL                                                                    AS [Phone 3],
    C.ContFamily                                                            AS [Fax],
    C.ContEmail                                                             AS [Email],
    E.ClientCreditEmail                                                     AS [ClientCreditEmail],
    E.ClientBillingEmail                                                    AS [ClientBillingEmail],
    E.ClientStatementEmail                                                  AS [ClientStatementEmail],
    NULL                                                                    AS [Client Web Address],
    'N'                                                                     AS [Master (Y/N)],

    -- Staff assignments
    P.StaffName                                                             AS [Primary Partner Name],
    P.StaffCode                                                             AS [Primary Partner Number],
    P.StaffName                                                             AS [Secondary Partner Name],
    P.StaffCode                                                             AS [Secondary Partner Number],
    M.StaffName                                                             AS [Responsible Person Name],
    M.StaffCode                                                             AS [Responsible Person Number],
    NULL                                                                    AS [Manager Name],
    NULL                                                                    AS [Manager Number],
    M.StaffName                                                             AS [Biller Name],
    M.StaffCode                                                             AS [Biller Number],
    NULL                                                                    AS [Tax Preparer Name],
    NULL                                                                    AS [Tax Preparer Number],
    NULL                                                                    AS [Tax Reviewer Name],
    NULL                                                                    AS [Tax Reviewer Number]
INTO AA_CCH_Clients
FROM tblEngagement E
INNER JOIN tblContacts   C  ON C.ContIndex  = E.ClientRef
INNER JOIN tblDepartment D  ON D.DeptIdx    = E.ClientDepartment
INNER JOIN tblStaff      P  ON P.StaffIndex = E.ClientPartner
INNER JOIN tblStaff      M  ON M.StaffIndex = E.ClientManager
LEFT  JOIN tblOwnerType  O  ON O.OwnerIndex = E.ClientOwnership
LEFT  JOIN tblSICCodes   SS ON SS.SICCode   = E.ClientSICCode
LEFT  JOIN tblCategory   I  ON I.Category   = E.ClientIndustry AND I.CatType = 'INDUSTRY'
LEFT  JOIN tblClientGainLoss G ON G.ContIndex = E.ContIndex    AND G.ClientGainLoss = 'LOSS'
WHERE E.ContIndex < 900000;

/*
--------------------------------------------------------------------------------
STEP 2: Build CCH_Clients_Export (final import table)
--------------------------------------------------------------------------------
*/

SELECT *
INTO CCH_Clients_Export
FROM AA_CCH_Clients
ORDER BY [Cltnum];

/*
--------------------------------------------------------------------------------
STEP 3: Final Output
--------------------------------------------------------------------------------
*/

SELECT *
FROM CCH_Clients_Export
ORDER BY [Cltnum];

GO
