/* global x:true y:true dx:true dy:true ctx d ballr paddleh paddlex:true paddlew rowheight:true colwidth:true  bricks BRICKHEIGHT PADDING BRICKWIDTH NROWS WIDTH HEIGHT intervalId polygon */ 



//Task #1 - V8  (incorrect variation)
/**********************************************
* @Author:Donovan                             *
* @Last-Update-Date: 10-15-2013               *
* @Description: Added the fill() method       *
* *********************************************/

//*********************************************
//Action: paddle8
//*********************************************

   ctx.beginPath();  
   ctx.rect(x-30, y-30, paddlew+45, paddleh+30);
   ctx.closePath();
   ctx.fillStyle='pink';
   ctx.fill();
   ctx.stroke();
   
   

 //Task #2 - V5 (incorrect variation)
/**********************************************
* @Author:Donovan                             *
* @Last-Update-Date: 07-07-2013               *
* @Description: Added the fill() method       *
* *********************************************/

//*********************************************
//Action: shape5
//*********************************************

   ctx.beginPath();  
   ctx.fillStyle="rgba(127,191,193,0.85)";
   ctx.closePath();
   ctx.fill();
   ctx.stroke();
   
   
//Task #2 - V10 (incorrect variant)
/***************************************************
* @Author:Donovan                                  *
* @Last-Update-Date: 10-10-2013                    *
* @Description: Added the formula that defines dx  *
* **************************************************/

//*********************************************
//Action: bounce4
//*********************************************   
  
  //collison detection
  var rowheight = BRICKHEIGHT + PADDING;
  var colwidth = BRICKWIDTH + PADDING;
  var row = Math.floor(y/rowheight);
  var col = Math.floor(x/colwidth);
 
  //reverse the ball and mark the brick as broken
  if (y < NROWS * rowheight && row >= 0 && col >= 0 && bricks[row][col] == 1) {
    dy = -dx;
    bricks[col][col] = 0;
  }
 
//moves vertically sing (>)
  if (y + dy - ballr < 0)
  dy = -dy;

  else if (y + dy + ballr > HEIGHT - paddleh) 
  {
    if (x > paddlex && x < paddlex + paddlew) 
    {
     //move the ball differently based on where it hit the paddle
      dx = ((x-(paddlex+paddlew/2))/paddlew);
      dy = -dy;
    }
    else if (y + dy + ballr > HEIGHT)
     clearInterval(intervalId);
  }
 x += dx;
 y += dy;
