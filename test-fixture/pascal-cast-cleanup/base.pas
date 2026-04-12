function ClampByte(x: Integer): Integer;
begin
  if Integer(x) < Integer(0) then
  begin
    ClampByte := 0;
    return;
  end;
  if Integer(x) > Integer(255) then
  begin
    ClampByte := 255;
    return;
  end;
  ClampByte := x;
end;
