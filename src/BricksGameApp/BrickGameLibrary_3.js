/* global x:true y:true dx:true dy:true ctx d ballr paddleh paddlex:true paddlew rowheight:true colwidth:true  bricks BRICKHEIGHT PADDING BRICKWIDTH NROWS WIDTH HEIGHT intervalId polygon */ 



/**********************************************
* @Author:Donovan                             *
* @Last-Update-Date: 10-15-2013               *
* @Description: Added the fill() method       *
* *********************************************/

//*********************************************
//Action: paddle
//*********************************************

   ctx.beginPath();  
   ctx.rect(x-30, y-30, paddlew+45, paddleh+30);
   ctx.closePath();
   ctx.fillStyle='pink';
   ctx.fill();
   ctx.stroke();
 
 

/**********************************************
* @Author:Donovan                             *
* @Last-Update-Date: 06-06-2013               *
* @Description: Added the fill() method       *
* *********************************************/

//*********************************************
//Action: shape
//*********************************************

   ctx.beginPath();  
   ctx.arc(x, y, (d/2), 0, Math.PI*2, false); 
   ctx.fillStyle="rgba(127,11,93,0.75)";
   ctx.closePath();
   ctx.fill();
   ctx.stroke();


/***********************************************
* @Author:Donovan                              *
* @Last-Update-Date: 1-3-2013                  *
* @Description: Added the clearInterval method *
* **********************************************/

//*********************************************
//Action: bounce
//*********************************************   
  
  //collison detection
  var rowheight = BRICKHEIGHT + PADDING;
  var colwidth = BRICKWIDTH + PADDING;
  var row = Math.floor(y/rowheight);
  var col = Math.floor(x/colwidth);
 
  //reverse the ball and mark the brick as broken
  if (y < NROWS * rowheight && row >= 0 && col >= 0 && bricks[row][col] == 1) {
    dy = -dy;
    bricks[row][col] = 0;
  }

  if (x + dx + ballr < WIDTH || x + dx - ballr > 0)
    dx = -dx;

  if (y + dy - ballr < 0)
  dy = -dy;

  else if (y + dy + ballr > HEIGHT - paddleh) 
  {
    if (x > paddlex && x < paddlex + paddlew) 
    {
      //move the ball differently based on where it hit the paddle
      dx = 8 * ((x-(paddlex/2))/paddlew);
      dy = -dy;
    }
    else if (y + dy + ballr > HEIGHT)
     clearInterval(intervalId);
  }
 x += dx;
 y += -dx;
