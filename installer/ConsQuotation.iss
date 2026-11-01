; Bộ cài ConsQuotation bản Windows (docs/NATIVE_PLAN.md, giai đoạn N0).
; - Cài cho người dùng hiện tại vào %LOCALAPPDATA%\Programs\ConsQuotation, không cần quyền admin.
; - Đăng ký file .xll đúng bitness của Excel qua HKCU\...\Excel\Options\OPENn để Excel tự nạp khi mở.
; - Gỡ cài: chỉ xóa mục của ConsQuotation, các add-in khác giữ nguyên thứ tự.
; Build: iscc /DAppVersion=2.0.0 /DNumericVersion=2.0.0.0 /DBuildDir=<thư mục publish> ConsQuotation.iss

#ifndef AppVersion
  #define AppVersion "2.0.0-alpha.1"
#endif
#ifndef NumericVersion
  #define NumericVersion "2.0.0.0"
#endif
#ifndef BuildDir
  #define BuildDir "..\native\src\ConsQuotation.AddIn\bin\Release\net48\publish"
#endif

[Setup]
AppId={{8C5B1F3A-6E2D-4B7A-9C41-2F0D7E5A3B19}
AppName=ConsQuotation
AppVersion={#AppVersion}
AppVerName=ConsQuotation {#AppVersion}
AppPublisher=ConsQuotation
AppPublisherURL=https://github.com/Consquotation/consquotation
AppSupportURL=https://github.com/Consquotation/consquotation/issues
AppUpdatesURL=https://github.com/Consquotation/consquotation/releases
VersionInfoVersion={#NumericVersion}
DefaultDirName={localappdata}\Programs\ConsQuotation
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=ConsQuotation-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=ConsQuotation

[Files]
Source: "{#BuildDir}\ConsQuotation-packed.xll"; DestDir: "{app}"; DestName: "ConsQuotation.xll"; Flags: ignoreversion
Source: "{#BuildDir}\ConsQuotation64-packed.xll"; DestDir: "{app}"; DestName: "ConsQuotation64.xll"; Flags: ignoreversion

[Code]
const
  OptionsKey = 'Software\Microsoft\Office\16.0\Excel\Options';

{ Excel 64-bit: Click-to-Run ghi Platform=x64; bản MSI 64-bit có khóa ở nhánh registry 64-bit. }
function ExcelIs64Bit(): Boolean;
var
  Platform: String;
begin
  Result := False;
  if not IsWin64 then
    Exit;
  if RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\Office\ClickToRun\Configuration', 'Platform', Platform) then
  begin
    Result := CompareText(Platform, 'x64') = 0;
    Exit;
  end;
  Result := RegKeyExists(HKLM64, 'SOFTWARE\Microsoft\Office\16.0\Excel\InstallRoot');
end;

function XllPath(): String;
begin
  if ExcelIs64Bit() then
    Result := ExpandConstant('{app}\ConsQuotation64.xll')
  else
    Result := ExpandConstant('{app}\ConsQuotation.xll');
end;

function OpenName(I: Integer): String;
begin
  if I = 0 then
    Result := 'OPEN'
  else
    Result := 'OPEN' + IntToStr(I);
end;

function IsOurs(Value: String): Boolean;
begin
  Result := Pos(Lowercase(ExpandConstant('{app}')), Lowercase(Value)) > 0;
end;

{ Đọc OPEN, OPEN1, OPEN2... theo thứ tự; Excel dừng đọc ở số thứ tự trống đầu tiên. }
procedure ReadOpenValues(var Values: TArrayOfString);
var
  I: Integer;
  V: String;
begin
  SetArrayLength(Values, 0);
  I := 0;
  while RegQueryStringValue(HKCU, OptionsKey, OpenName(I), V) do
  begin
    SetArrayLength(Values, I + 1);
    Values[I] := V;
    I := I + 1;
  end;
end;

{ Ghi lại liên tục từ OPEN, xóa phần thừa phía sau để không để lại chỗ trống. }
procedure WriteOpenValues(Values: TArrayOfString; OldCount: Integer);
var
  I: Integer;
begin
  for I := 0 to GetArrayLength(Values) - 1 do
    RegWriteStringValue(HKCU, OptionsKey, OpenName(I), Values[I]);
  for I := GetArrayLength(Values) to OldCount - 1 do
    RegDeleteValue(HKCU, OptionsKey, OpenName(I));
end;

{ Bỏ mục của ConsQuotation, giữ nguyên thứ tự các add-in khác. }
procedure RemoveOurs(var Values: TArrayOfString);
var
  I, Count: Integer;
  Kept: TArrayOfString;
begin
  Count := 0;
  SetArrayLength(Kept, 0);
  for I := 0 to GetArrayLength(Values) - 1 do
    if not IsOurs(Values[I]) then
    begin
      SetArrayLength(Kept, Count + 1);
      Kept[Count] := Values[I];
      Count := Count + 1;
    end;
  Values := Kept;
end;

procedure RegisterXll();
var
  Values: TArrayOfString;
  OldCount: Integer;
begin
  ReadOpenValues(Values);
  OldCount := GetArrayLength(Values);
  RemoveOurs(Values);
  SetArrayLength(Values, GetArrayLength(Values) + 1);
  Values[GetArrayLength(Values) - 1] := '/R "' + XllPath() + '"';
  WriteOpenValues(Values, OldCount);
end;

procedure UnregisterXll();
var
  Values: TArrayOfString;
  OldCount: Integer;
begin
  ReadOpenValues(Values);
  OldCount := GetArrayLength(Values);
  RemoveOurs(Values);
  WriteOpenValues(Values, OldCount);
end;

{ Excel đang mở thì file .xll bị khóa và Excel ghi đè danh sách add-in khi thoát: chờ người dùng đóng. }
function WaitForExcelClosed(): Boolean;
begin
  Result := True;
  while FindWindowByClassName('XLMAIN') <> 0 do
    if MsgBox('Excel đang mở. Hãy lưu công việc và đóng Excel, rồi bấm OK để tiếp tục (Cancel để dừng).',
      mbInformation, MB_OKCANCEL) = IDCANCEL then
    begin
      Result := False;
      Exit;
    end;
end;

function InitializeSetup(): Boolean;
begin
  Result := WaitForExcelClosed();
end;

function InitializeUninstall(): Boolean;
begin
  Result := WaitForExcelClosed();
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    RegisterXll();
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    UnregisterXll();
end;
