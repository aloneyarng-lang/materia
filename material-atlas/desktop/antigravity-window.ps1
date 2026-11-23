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
 [DllImport("user32")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, IntPtr pid);
 [StructLayout(LayoutKind.Sequential)] struct GuiInfo { public int size, flags; public IntPtr active,focus,capture,menu,move,caret; public int l,t,r,b; }
 [DllImport("user32")] static extern bool GetGUIThreadInfo(uint thread, ref GuiInfo info);
 [DllImport("user32")] static extern IntPtr GetAncestor(IntPtr window,uint flags);
 [DllImport("user32",CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint msg,UIntPtr key,IntPtr flags,uint options,uint timeout,out UIntPtr result);
 public static void TypeText(IntPtr window,string text) {
   var info=new GuiInfo(); info.size=Marshal.SizeOf(info);
   if(!GetGUIThreadInfo(GetWindowThreadProcessId(window,IntPtr.Zero),ref info)||GetAncestor(info.focus,2)!=window) throw new Exception("Input focus changed");
   foreach(char c in text) {
     UIntPtr result;
     if(GetForegroundWindow()!=window || SendMessageTimeout(info.focus,0x102,(UIntPtr)c,(IntPtr)1,2,1000,out result)==IntPtr.Zero) throw new Exception("Input interrupted");
   }
 }
}
"@
$request=[Console]::In.ReadToEnd() | ConvertFrom-Json
$p=Get-Process Antigravity | Where-Object {$_.MainWindowHandle -ne [IntPtr]::Zero -and $_.Path -eq $request.clientPath} | Select-Object -First 1
if(!$p){throw '反重力没有可用的桌面窗口。'}
$root=[Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
function Named($name){$root.FindAll(4,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty,$name))}
function Click($control){$control.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()}
$button=Named 'New Conversation' | Where-Object {$_.Current.ControlType.ProgrammaticName -eq 'ControlType.Button' -and $_.Current.IsEnabled} | Select-Object -Last 1
if(!$button){throw '反重力窗口未提供新建会话控件。'}
Click $button
$deadline=[DateTime]::UtcNow.AddSeconds(8)
do {
 Start-Sleep -Milliseconds 180
 $inputBox=Named 'Message input' | Select-Object -Last 1
 $newScreen=$root.FindAll(4,[Windows.Automation.Condition]::TrueCondition) | Where-Object {$_.Current.Name -like 'Select project, current:*'} | Select-Object -First 1
} until(($inputBox -and $newScreen) -or [DateTime]::UtcNow -gt $deadline)
if(!$newScreen -or !$inputBox){throw '无法确认新会话，已停止发送。'}
if(Named 'Send message'){throw '输入框已有草稿，已停止发送。'}
$deadline=[DateTime]::UtcNow.AddSeconds(5)
do {
 try {$inputBox=Named 'Message input' | Select-Object -Last 1;$inputBox.SetFocus()} catch {}
 Start-Sleep -Milliseconds 120
} until(($inputBox -and $inputBox.Current.HasKeyboardFocus) -or [DateTime]::UtcNow -gt $deadline)
if(!$inputBox -or !$inputBox.Current.HasKeyboardFocus){throw '无法聚焦反重力输入框。'}
[MateriaWindow]::TypeText($p.MainWindowHandle,$request.prompt)
$deadline=[DateTime]::UtcNow.AddSeconds(8)
do{
 Start-Sleep -Milliseconds 200
 $inputBox=Named 'Message input' | Select-Object -Last 1
 $send=Named 'Send message' | Select-Object -Last 1
 $typed=if($inputBox){$inputBox.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern).Current.Value}
 $matchesDraft=$typed -and $typed.Trim().Replace([char]160,[char]32) -ceq $request.prompt.Trim().Replace([char]160,[char]32)
} until(($send -and $matchesDraft) -or [DateTime]::UtcNow -gt $deadline)
if(!$send -or !$matchesDraft){throw '输入内容校验失败，已停止发送。'}
Click $send
while($true){
 Start-Sleep -Milliseconds 600
 $label=Named 'Agent said' | Select-Object -Last 1
 if(!$label){
   if((Named 'Conversation Log') -and ($root.FindAll(4,[Windows.Automation.Condition]::TrueCondition) | Where-Object {$_.Current.Name -like 'Error Agent execution terminated*'})){throw '反重力桌面客户端报告生成失败。'}
   continue
 }
 $answer=[Windows.Automation.TreeWalker]::RawViewWalker.GetParent($label)
 $nodes=$answer.FindAll(4,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Text))
 $text=($nodes | ForEach-Object {$_.Current.Name}) -join [Environment]::NewLine
 $begin=$text.IndexOf($request.begin)
 if($begin -ge 0){
   $begin+=$request.begin.Length
   $end=$text.IndexOf($request.end,$begin)
   if($end -gt $begin){[Console]::Write($text.Substring($begin,$end-$begin).Trim());exit 0}
 }
 if((Named 'Conversation Log') -and ($root.FindAll(4,[Windows.Automation.Condition]::TrueCondition) | Where-Object {$_.Current.Name -like 'Error Agent execution terminated*'})){throw '反重力桌面客户端报告生成失败。'}
}
