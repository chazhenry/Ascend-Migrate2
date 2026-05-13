/*
================================================================================
CCH Contacts Export Script
Builds AA_CCH_Contacts staging and CCH_Contacts_Export for CCH import.
Includes:
  - Primary client contacts
  - Related contacts (via tblContactRelationships, both directions)
================================================================================
*/

SET NOCOUNT ON;

-- Clean up prior runs
DROP TABLE IF EXISTS AA_CCH_Contacts;
DROP TABLE IF EXISTS CCH_Contacts_Export;

GO

/*
--------------------------------------------------------------------------------
STEP 1: Build AA_CCH_Contacts staging table
--------------------------------------------------------------------------------
*/

-- Primary client contacts
SELECT
    'Actual Client Contact'                                                 AS ClientRelationship,
    E.ClientCode                                                            AS [Client Number related to],
    0                                                                       AS [Engagement related to],
    P.PersonForenames                                                       AS [Fname],
    C.ContShort                                                             AS [Lname],
    C.ContPhone                                                             AS [Contact Phone1],
    C.ContMobile                                                            AS [Contact Phone 2],
    ''                                                                      AS [Contact Phone 3],
    C.ContFamily                                                            AS [Contact Fax],
    ''                                                                      AS [Title],
    C.ContEmail                                                             AS [Contact Email],
    C.ContSalutation                                                        AS [Salutation],
    CASE WHEN E.ClientInvDeliveryFormat = 1 THEN 'Y' ELSE 'N' END           AS [Email Invoice (Y/N)],
    CASE WHEN E.ClientDeliveryFormat    = 1 THEN 'Y' ELSE 'N' END           AS [Email AR Statement (Y/N)],
    'Y'                                                                     AS [ContactAddrSameAsClt (Y/N)],
    'Y'                                                                     AS [ContactPhoneSameAsClt (Y/N)],
    C.ContAddress                                                           AS [Contact Addr1],
    ''                                                                      AS [Contact Addr2],
    ''                                                                      AS [Contact Addr3],
    C.ContTownCity                                                          AS [Contact city],
    C.ContCounty                                                            AS [Contact State/Provence],
    C.ContPostCode                                                          AS [Contact Zip/Postal Code],
    C.ContCountry                                                           AS [Contact Country],
    A.Description                                                           AS [Contact Billing Addr1],
    ''                                                                      AS [Contact Billing Addr2],
    ''                                                                      AS [Contact Billing Addr3],
    ''                                                                      AS [Contact Billing City],
    ''                                                                      AS [Contact Billing State/Provence],
    A.PostCode                                                              AS [Contact Billing Zip/Postal Code],
    ''                                                                      AS [Contact Billing Country],
    ''                                                                      AS [Other],
    ''                                                                      AS [Category],
    0                                                                       AS SortOrder
INTO AA_CCH_Contacts
FROM tblContacts C
INNER JOIN tblEngagement E ON E.ClientRef = C.ContIndex
LEFT  JOIN tblAddresses  A ON A.ContIndex = C.ContIndex AND A.Address = 'BILLING'
LEFT  JOIN tblPerson     P ON P.ContIndex = C.ContIndex
WHERE E.ContIndex < 900000

UNION

-- Related contacts (ContIndex1 -> ContIndex2)
SELECT
    R.RelTitle                                                              AS ClientRelationship,
    E.ClientCode                                                            AS [Client Number related to],
    0                                                                       AS [Engagement related to],
    P.PersonForenames                                                       AS [Fname],
    C.ContShort                                                             AS [Lname],
    C.ContPhone                                                             AS [Contact Phone1],
    C.ContMobile                                                            AS [Contact Phone 2],
    ''                                                                      AS [Contact Phone 3],
    C.ContFamily                                                            AS [Contact Fax],
    ''                                                                      AS [Title],
    C.ContEmail                                                             AS [Contact Email],
    C.ContSalutation                                                        AS [Salutation],
    CASE WHEN E.ClientInvDeliveryFormat = 1 THEN 'Y' ELSE 'N' END           AS [Email Invoice (Y/N)],
    CASE WHEN E.ClientDeliveryFormat    = 1 THEN 'Y' ELSE 'N' END           AS [Email AR Statement (Y/N)],
    'N'                                                                     AS [ContactAddrSameAsClt (Y/N)],
    'N'                                                                     AS [ContactPhoneSameAsClt (Y/N)],
    C.ContAddress                                                           AS [Contact Addr1],
    ''                                                                      AS [Contact Addr2],
    ''                                                                      AS [Contact Addr3],
    C.ContTownCity                                                          AS [Contact city],
    C.ContCounty                                                            AS [Contact State/Provence],
    C.ContPostCode                                                          AS [Contact Zip/Postal Code],
    C.ContCountry                                                           AS [Contact Country],
    A.Description                                                           AS [Contact Billing Addr1],
    ''                                                                      AS [Contact Billing Addr2],
    ''                                                                      AS [Contact Billing Addr3],
    ''                                                                      AS [Contact Billing City],
    ''                                                                      AS [Contact Billing State/Provence],
    A.PostCode                                                              AS [Contact Billing Zip/Postal Code],
    ''                                                                      AS [Contact Billing Country],
    ''                                                                      AS [Other],
    ''                                                                      AS [Category],
    1                                                                       AS SortOrder
FROM tblContacts C
INNER JOIN tblContactRelationships R ON R.ContIndex1 = C.ContIndex
INNER JOIN tblEngagement           E ON E.ClientRef  = R.ContIndex2
LEFT  JOIN tblAddresses            A ON A.ContIndex  = C.ContIndex AND A.Address = 'BILLING'
LEFT  JOIN tblPerson               P ON P.ContIndex  = C.ContIndex
WHERE E.ContIndex < 900000

UNION

-- Related contacts (ContIndex2 -> ContIndex1)
SELECT
    R.RelTitle                                                              AS ClientRelationship,
    E.ClientCode                                                            AS [Client Number related to],
    0                                                                       AS [Engagement related to],
    P.PersonForenames                                                       AS [Fname],
    C.ContShort                                                             AS [Lname],
    C.ContPhone                                                             AS [Contact Phone1],
    C.ContMobile                                                            AS [Contact Phone 2],
    ''                                                                      AS [Contact Phone 3],
    C.ContFamily                                                            AS [Contact Fax],
    ''                                                                      AS [Title],
    C.ContEmail                                                             AS [Contact Email],
    C.ContSalutation                                                        AS [Salutation],
    CASE WHEN E.ClientInvDeliveryFormat = 1 THEN 'Y' ELSE 'N' END           AS [Email Invoice (Y/N)],
    CASE WHEN E.ClientDeliveryFormat    = 1 THEN 'Y' ELSE 'N' END           AS [Email AR Statement (Y/N)],
    'N'                                                                     AS [ContactAddrSameAsClt (Y/N)],
    'N'                                                                     AS [ContactPhoneSameAsClt (Y/N)],
    C.ContAddress                                                           AS [Contact Addr1],
    ''                                                                      AS [Contact Addr2],
    ''                                                                      AS [Contact Addr3],
    C.ContTownCity                                                          AS [Contact city],
    C.ContCounty                                                            AS [Contact State/Provence],
    C.ContPostCode                                                          AS [Contact Zip/Postal Code],
    C.ContCountry                                                           AS [Contact Country],
    A.Description                                                           AS [Contact Billing Addr1],
    ''                                                                      AS [Contact Billing Addr2],
    ''                                                                      AS [Contact Billing Addr3],
    ''                                                                      AS [Contact Billing City],
    ''                                                                      AS [Contact Billing State/Provence],
    A.PostCode                                                              AS [Contact Billing Zip/Postal Code],
    ''                                                                      AS [Contact Billing Country],
    ''                                                                      AS [Other],
    ''                                                                      AS [Category],
    1                                                                       AS SortOrder
FROM tblContacts C
INNER JOIN tblContactRelationships R ON R.ContIndex2 = C.ContIndex
INNER JOIN tblEngagement           E ON E.ClientRef  = R.ContIndex1
LEFT  JOIN tblAddresses            A ON A.ContIndex  = C.ContIndex AND A.Address = 'BILLING'
LEFT  JOIN tblPerson               P ON P.ContIndex  = C.ContIndex
WHERE E.ContIndex < 900000;

/*
--------------------------------------------------------------------------------
STEP 2: Build CCH_Contacts_Export (final import table)
--------------------------------------------------------------------------------
*/

SELECT *
INTO CCH_Contacts_Export
FROM AA_CCH_Contacts
ORDER BY SortOrder, ClientRelationship, [Client Number related to], [Lname];

/*
--------------------------------------------------------------------------------
STEP 3: Final Output
--------------------------------------------------------------------------------
*/

SELECT *
FROM CCH_Contacts_Export
ORDER BY SortOrder, ClientRelationship, [Client Number related to], [Lname];

GO
