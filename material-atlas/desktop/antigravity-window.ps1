$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class MateriaWindow {
 [DllImport("user32")] public static extern IntPtr GetForegroundWindow();
 [StructLayout(LayoutKind.Sequential)] struct Point { public int x,y; }
 [DllImport("user32")] static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
 [DllImport("kernel32")] static extern uint GetCurrentThreadId();
 [DllImport("user32")] static extern bool AttachThreadInput(uint from,uint to,bool attach);
 [DllImport("user32")] static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32")] static extern bool IsIconic(IntPtr hwnd);
 [DllImport("user32")] static extern bool ShowWindowAsync(IntPtr hwnd,int command);
 public static bool Activate(IntPtr window) {
   if(IsIconic(window)) ShowWindowAsync(window,9);
   if(GetForegroundWindow()==window || SetForegroundWindow(window)) return true;
   uint ignored;
   uint current=GetCurrentThreadId(), foreground=GetWindowThreadProcessId(GetForegroundWindow(),out ignored);
   bool attached=foreground!=0 && foreground!=current && AttachThreadInput(current,foreground,true);
   try { return SetForegroundWindow(window); }
   finally { if(attached) AttachThreadInput(current,foreground,false); }
 }
 [DllImport("user32")] static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
 [DllImport("user32")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32")] static extern bool GetCursorPos(out Point point);
 [DllImport("user32")] static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 public static bool FocusEditor(IntPtr window,int x,int y) {
   IntPtr previousDpi=SetThreadDpiAwarenessContext(new IntPtr(-4));
   try { return ClickEditor(window,x,y); }
   finally { if(previousDpi!=IntPtr.Zero) SetThreadDpiAwarenessContext(previousDpi); }
 }
 static bool ClickEditor(IntPtr window,int x,int y) {
   Point target=new Point {x=x,y=y}, previous;
   if(GetForegroundWindow()!=window || GetAncestor(WindowFromPoint(target),2)!=window || !GetCursorPos(out previous)) return false;
   if(!SetCursorPos(x,y)) return false;
   try {
     if(GetForegroundWindow()!=window || GetAncestor(WindowFromPoint(target),2)!=window) return false;
     mouse_event(2,0,0,0,UIntPtr.Zero);
     mouse_event(4,0,0,0,UIntPtr.Zero);
     return true;
   } finally {
     Point current;
     if(GetCursorPos(out current) && current.x==x && current.y==y) SetCursorPos(previous.x,previous.y);
   }
 }
 [DllImport("user32",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,StringBuilder name,int size);
 [DllImport("user32",CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint message,UIntPtr key,IntPtr flags,uint options,uint timeout,out UIntPtr result);
 public static void TypeText(IntPtr window,int x,int y,string text) {
   IntPtr previousDpi=SetThreadDpiAwarenessContext(new IntPtr(-4));
   try {
     IntPtr target=WindowFromPoint(new Point {x=x,y=y});
     var name=new StringBuilder(128);
     GetClassName(target,name,name.Capacity);
     if(GetAncestor(target,2)!=window || name.ToString()!="Chrome_RenderWidgetHostHWND") throw new Exception("Could not identify the chat editor window");
     foreach(char c in text) {
       UIntPtr result;
       if(GetForegroundWindow()!=window || SendMessageTimeout(target,0x102,(UIntPtr)c,(IntPtr)1,2,1000,out result)==IntPtr.Zero) throw new Exception("Input interrupted");
     }
   } finally {
     if(previousDpi!=IntPtr.Zero) SetThreadDpiAwarenessContext(previousDpi);
   }
 }
}
"@
$request=[Console]::In.ReadToEnd() | ConvertFrom-Json
$processName=if($request.gemini){'Gemini'}else{'Antigravity'}
if($request.gemini){
 $app=(New-Object -ComObject Shell.Application).Namespace('shell:AppsFolder').ParseName('com.google.gemini.windows')
 if(!$app){throw '未找到 Gemini Windows 客户端。'}
 $app.InvokeVerb('open')
 Start-Sleep -Milliseconds 900
}
$p=Get-Process $processName -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne [IntPtr]::Zero -and ($request.gemini -or $_.Path -eq $request.clientPath)} | Select-Object -First 1
if(!$p){throw "请先打开 $processName 桌面客户端。"}
$root=[Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
function Named($name){$root.FindAll(4,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty,$name))}
function AllControls {$root.FindAll(4,[Windows.Automation.Condition]::TrueCondition)}
function Click($control){$control.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()}
function Expand($control){$control.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern).Expand();Start-Sleep -Milliseconds 400}
function Picker {AllControls | Where-Object {$_.Current.ControlType.ProgrammaticName -eq 'ControlType.Button' -and $_.Current.Name -like 'Select model, current:*'} | Select-Object -Last 1}
function MenuItems {AllControls | Where-Object {$_.Current.ControlType.ProgrammaticName -eq 'ControlType.MenuItem' -and $_.Current.IsEnabled}}
function GeminiPicker {AllControls | Where-Object {$_.Current.Name -like '打开模式选择器*' -and $_.Current.ControlType.ProgrammaticName -eq 'ControlType.Button'} | Select-Object -Last 1}
function GeminiChoices {AllControls | Where-Object {$_.Current.ControlType.ProgrammaticName -eq 'ControlType.RadioButton' -and $_.Current.IsEnabled -and $_.Current.Name -match '\b\d+(?:\.\d+)* [A-Za-z][A-Za-z0-9 -]*$'}}
function GeminiModels($target){
 $picker=GeminiPicker
 if(!$picker){throw '未找到 Gemini 模型菜单。'}
 if($target -and $picker.Current.Name.Contains('“'+($target -replace '^\S+ ','')+'”')){return}
 $choices=@(GeminiChoices)
 if(!$choices.Count){
   Add-Type -AssemblyName System.Windows.Forms
   $picker.SetFocus()
   if([MateriaWindow]::GetForegroundWindow() -ne $p.MainWindowHandle){throw 'Gemini 窗口未取得焦点。'}
   [Windows.Forms.SendKeys]::SendWait('{ENTER}')
   Start-Sleep -Milliseconds 450
   $choices=@(GeminiChoices)
 }
 try{
   if(!$choices.Count){throw 'Gemini 未返回可用模型。'}
   foreach($choice in $choices){
     $name=[regex]::Match($choice.Current.Name,'\b\d+(?:\.\d+)* [A-Za-z][A-Za-z0-9 -]*$').Value.Trim()
     if(!$target){$name}elseif($name -ceq $target){
       $choice.GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern).Select()
       Start-Sleep -Milliseconds 650
       break
     }
   }
 }finally{
   if(@(GeminiChoices).Count -and [MateriaWindow]::GetForegroundWindow() -eq $p.MainWindowHandle){
     Add-Type -AssemblyName System.Windows.Forms
     [Windows.Forms.SendKeys]::SendWait('{ESC}')
   }
 }
 if($target){
   Start-Sleep -Milliseconds 350
   if(!(GeminiPicker).Current.Name.Contains('“'+($target -replace '^\S+ ','')+'”')){throw "Gemini 未确认切换到 $target。"}
 }
}
function Models($target){
 $picker=Picker
 if(!$picker){throw '找不到反重力模型选择器。'}
 if($target -and $picker.Current.Name -eq "Select model, current: $target"){return}
 try{
  Expand $picker
  if(!@(MenuItems).Count){
   $picker.SetFocus()
   if([MateriaWindow]::GetForegroundWindow() -eq $p.MainWindowHandle){
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds 450
   }
  }
  $items=@(MenuItems | Sort-Object {if($_.Current.Name -match " (Low|Medium|High)$"){1}else{0}})
  if(!$items.Count){throw '反重力模型菜单未打开。'}
  foreach($item in $items){
   $name=$item.Current.Name -replace ' Notice$',''
   if($name -match 'Unavailable|View Usage' -or !$name -or $item.Current.IsOffscreen){continue}
   if($name -match '^(.+?) (Low|Medium|High)$'){
    $family=$Matches[1]
    if(!$target -or $target.StartsWith("$family ")){
     $item.SetFocus()
     if([MateriaWindow]::GetForegroundWindow() -ne $p.MainWindowHandle){throw '请让反重力窗口可见后重新检测。'}
     Add-Type -AssemblyName System.Windows.Forms
     [Windows.Forms.SendKeys]::SendWait('{RIGHT}')
     Start-Sleep -Milliseconds 350
     foreach($level in 'Low','Medium','High'){
      $choice=Named $level | Where-Object {$_.Current.IsEnabled -and $_.Current.ControlType.ProgrammaticName -match 'MenuItem|RadioButton|ListItem'} | Select-Object -Last 1
      if($choice){if(!$target){"$family $level"}elseif($target -eq "$family $level"){Click $choice;break}}
     }
    }
   }elseif(!$target){$name}elseif($name -eq $target){Click $item;break}
  }
 }finally{try{$picker.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern).Collapse()}catch{}}
 if($target){Start-Sleep -Milliseconds 350;if((Picker).Current.Name -ne "Select model, current: $target"){throw "反重力未确认模型 $target，请检查客户端中的模型可用性。"}}
}
$inputName=if($request.gemini){'为 Gemini 输入提示'}else{'Message input'}
if($request.inspect){
 if($request.gemini){if(!(Named $inputName)){throw '请在 Gemini 桌面客户端打开聊天页面。'};[Console]::Write((ConvertTo-Json -InputObject @(GeminiModels '') -Compress))}
 else{
  $picker=Picker
  if(!(Named $inputName) -or !$picker){throw '请在反重力桌面客户端打开聊天页面。'}
  $current=$picker.Current.Name -replace '^Select model, current: ',''
  try{$models=@(Models '')}catch{$models=@()}
  [Console]::Write((ConvertTo-Json -InputObject @(@($current)+$models | Where-Object {$_} | Select-Object -Unique) -Compress))
 }
 exit 0
}
$newName=if($request.gemini){'发起新对话'}else{'New Conversation'}
$buttons=@(Named $newName | Where-Object {$_.Current.IsEnabled -and !$_.Current.IsOffscreen})
$button=if($request.gemini){$buttons | Select-Object -Last 1}else{
 $buttons | Where-Object {$_.Current.ControlType -eq [Windows.Automation.ControlType]::Hyperlink} | Select-Object -First 1
}
if(!$button){$button=$buttons | Select-Object -Last 1}
if(!$button){throw '客户端窗口未提供新建会话控件。'}
Click $button
$deadline=[DateTime]::UtcNow.AddSeconds(8)
do {
 Start-Sleep -Milliseconds 180
 $inputBox=Named $inputName | Select-Object -Last 1
 $newScreen=if($request.gemini){Named '需要我为你做些什么？' | Select-Object -First 1}else{$root.FindAll(4,[Windows.Automation.Condition]::TrueCondition) | Where-Object {$_.Current.Name -like 'Select project, current:*'} | Select-Object -First 1}
} until(($inputBox -and $newScreen -and ($request.gemini -or !(Named 'Conversation Log'))) -or [DateTime]::UtcNow -gt $deadline)
if(!$newScreen -or !$inputBox -or (!$request.gemini -and (Named 'Conversation Log'))){throw '无法确认新会话，已停止发送。'}
if($request.model){if($request.gemini){GeminiModels $request.model}else{Models $request.model}}
$sendName=if($request.gemini){'发送'}else{'Send message'}
if(Named $sendName){throw '输入框已有草稿，已停止发送。'}
$inputBox=Named $inputName | Select-Object -Last 1
$value=$inputBox.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
if($value.Current.Value.Trim()){throw '输入框已有草稿，已停止发送。'}
try{$value.SetValue($request.prompt)}catch{}
Start-Sleep -Milliseconds 180
$inputBox=Named $inputName | Select-Object -Last 1
$value=$inputBox.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
if(!$value.Current.Value.Trim() -and !(Named $sendName)){
 [void][MateriaWindow]::Activate($p.MainWindowHandle)
 $deadline=[DateTime]::UtcNow.AddSeconds(5)
 do {
  try {$inputBox=Named $inputName | Select-Object -Last 1;$inputBox.SetFocus()} catch {}
  Start-Sleep -Milliseconds 120
 } until(($inputBox -and $inputBox.Current.HasKeyboardFocus -and [MateriaWindow]::GetForegroundWindow() -eq $p.MainWindowHandle) -or [DateTime]::UtcNow -gt $deadline)
 if(!$inputBox -or [MateriaWindow]::GetForegroundWindow() -ne $p.MainWindowHandle){throw 'Windows 未允许切换到客户端。请先将客户端切到前台。'}
 $box=$inputBox.Current.BoundingRectangle
 if($box.IsEmpty -or ![MateriaWindow]::FocusEditor($p.MainWindowHandle,[int]($box.Left+$box.Width/2),[int]($box.Top+$box.Height/2))){throw '客户端输入框被遮挡或位置已变化，请将客户端窗口完整显示后重试。'}
 Start-Sleep -Milliseconds 150
 if([MateriaWindow]::GetForegroundWindow() -ne $p.MainWindowHandle -or !$inputBox.Current.HasKeyboardFocus){throw '输入焦点已改变，已停止发送。'}
 [MateriaWindow]::TypeText($p.MainWindowHandle,[int]($box.Left+$box.Width/2),[int]($box.Top+$box.Height/2),$request.prompt)
}
$deadline=[DateTime]::UtcNow.AddSeconds(8)
do{
 Start-Sleep -Milliseconds 200
 $inputBox=Named $inputName | Select-Object -Last 1
 $send=Named $sendName | Where-Object {$_.Current.IsEnabled -and !$_.Current.IsOffscreen} | Select-Object -Last 1
 $typed=if($inputBox){$inputBox.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern).Current.Value}
 $matchesDraft=$typed -and $typed.Trim().Replace([char]160,[char]32) -ceq $request.prompt.Trim().Replace([char]160,[char]32)
} until(($send -and $matchesDraft) -or [DateTime]::UtcNow -gt $deadline)
if(!$send -or !$matchesDraft){throw '输入内容校验失败，已停止发送。'}
Click $send
while($true){
 Start-Sleep -Milliseconds 600
 if($request.gemini){
   $nodes=AllControls | Where-Object {$_.Current.ControlType.ProgrammaticName -eq 'ControlType.Text'}
   $text=($nodes | ForEach-Object {$_.Current.Name}) -join [Environment]::NewLine
 }else{
 $label=Named 'Agent said' | Select-Object -Last 1
 if(!$label){
   if((Named 'Conversation Log') -and ($root.FindAll(4,[Windows.Automation.Condition]::TrueCondition) | Where-Object {$_.Current.Name -like 'Error Agent execution terminated*'})){throw '反重力桌面客户端报告生成失败。'}
   continue
 }
 $answer=[Windows.Automation.TreeWalker]::RawViewWalker.GetParent($label)
 $nodes=$answer.FindAll(4,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Text))
 $text=($nodes | ForEach-Object {$_.Current.Name}) -join ''
 }
 $begin=$text.LastIndexOf($request.begin)
 if($begin -ge 0){
   $begin+=$request.begin.Length
   $end=$text.IndexOf($request.end,$begin)
   if($end -gt $begin){[Console]::Write($text.Substring($begin,$end-$begin).Trim());exit 0}
 }
 if((Named 'Conversation Log') -and ($root.FindAll(4,[Windows.Automation.Condition]::TrueCondition) | Where-Object {$_.Current.Name -like 'Error Agent execution terminated*'})){throw '反重力桌面客户端报告生成失败。'}
}
